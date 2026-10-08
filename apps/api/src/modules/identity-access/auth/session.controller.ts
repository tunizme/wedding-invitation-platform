import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { Public, type AuthenticatedRequest } from '../authorization/auth.guard';
import { RateLimitService } from '../infrastructure/rate-limit.service';
import { transaction } from '../infrastructure/transactions';
import { BrowserSecurityService } from './browser-security.service';
import { RefreshService } from './refresh.service';
import { SessionService } from './session.service';
import { headerValue } from './login.controller';
import { AuthIntentService } from '../context/auth-intent.service';
import {
  IDENTITY_CONFIG,
  type IdentityEnvironment,
} from '../../../config/identity-access.environment';

@Controller('auth')
export class SessionController {
  constructor(
    @Inject(RefreshService) private readonly refresh: RefreshService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(BrowserSecurityService)
    private readonly browser: BrowserSecurityService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AuthIntentService) private readonly intents: AuthIntentService,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnvironment,
  ) {}

  @Get('csrf')
  @Public()
  @Header('Cache-Control', 'no-store')
  async csrf(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const contextId = headerValue(request, 'x-auth-context');
    if (contextId) {
      const current = await this.refresh.currentForContext(
        request,
        contextId,
        headerValue(request, 'x-auth-session-tag'),
      );
      return {
        csrfToken: this.browser.csrf({
          type: 'session',
          id: current.session.id,
          seed: current.session.csrf_seed,
          keyVersion: current.session.csrf_key_version,
        }),
      };
    }
    // Cutover: a legacy singleton cookie can never restore an IAM session.
    this.browser.clearCookie(response);
    throw new UnauthorizedException();
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async rotate(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.requireOrigin(request);
    const contextId = headerValue(request, 'x-auth-context');
    if (contextId) return this.rotateInContext(request, response, contextId);
    this.browser.clearCookie(response);
    throw new UnauthorizedException();
  }

  /** 006 F3: current-slot rotation with CSRF of the current session (003). */
  private async rotateInContext(
    request: Request,
    response: Response,
    contextId: string,
  ) {
    const expectedTag = headerValue(request, 'x-auth-session-tag');
    const current = await this.refresh.currentForContext(
      request,
      contextId,
      expectedTag,
      { requireEligible: false },
    );
    await this.limiter.consume('REFRESH', current.session.id);
    this.browser.requireCsrf(request, {
      type: 'session',
      id: current.session.id,
      seed: current.session.csrf_seed,
      keyVersion: current.session.csrf_key_version,
    });
    const rotated = await this.refresh.rotateCurrent(
      request,
      contextId,
      expectedTag,
    );
    this.browser.clearProtocolNames(response, rotated.cleanupNames);
    this.browser.writeSlot(
      response,
      rotated.slotTag,
      rotated.refreshToken,
      rotated.expiresAt,
    );
    this.browser.writeBinding(
      response,
      contextId,
      rotated.bindingSecret,
      this.config.authContext.confirmedBindingSeconds,
    );
    return {
      authProtocol: 2 as const,
      accessToken: rotated.accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: 900 as const,
      csrfToken: this.browser.csrf({
        type: 'session',
        id: rotated.sessionId,
        seed: rotated.csrfSeed,
        keyVersion: rotated.csrfKeyVersion,
      }),
      sessionTag: rotated.slotTag,
      contextRevision: rotated.contextRevision,
      user: rotated.user,
    };
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.requireOrigin(request);
    const contextId = headerValue(request, 'x-auth-context');
    if (contextId) {
      const intentId = headerValue(request, 'x-auth-intent');
      if (!intentId) throw new UnauthorizedException();
      const { slotTag, cleanupNames } = await this.intents.logoutCaptured(
        request,
        contextId,
        intentId,
        (session) =>
          this.browser.requireCsrf(request, {
            type: 'session',
            id: session.id,
            seed: session.csrf_seed,
            keyVersion: session.csrf_key_version,
          }),
      );
      this.browser.clearProtocolNames(
        response,
        cleanupNames.filter(
          (name) => !slotTag || name !== this.browser.slotCookieName(slotTag),
        ),
      );
      if (slotTag) this.browser.clearSlot(response, slotTag);
      return;
    }
    this.browser.clearCookie(response);
    throw new UnauthorizedException();
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await transaction(this.db, (manager) =>
      this.sessions.revokeAll(manager, request.principal.userId, 'LOGOUT_ALL'),
    );
    // 006: clear only the bearer session's own slot; never another session's.
    const tag = await this.sessions.slotTagOf(
      this.db,
      request.principal.sessionId,
    );
    if (tag) this.browser.clearSlot(response, tag);
    else this.browser.clearCookie(response);
  }
}
