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

@Controller('auth')
export class SessionController {
  constructor(
    @Inject(RefreshService) private readonly refresh: RefreshService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(BrowserSecurityService)
    private readonly browser: BrowserSecurityService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
    @Inject(DataSource) private readonly db: DataSource,
  ) {}

  private async active(request: Request) {
    const token = this.browser.readCookie(request);
    if (!token) return undefined;
    try {
      return { token, context: await this.refresh.context(token) };
    } catch {
      return undefined;
    }
  }

  @Get('csrf')
  @Public()
  @Header('Cache-Control', 'no-store')
  async csrf(@Req() request: Request) {
    const active = await this.active(request);
    if (!active) throw new UnauthorizedException();
    return {
      csrfToken: this.browser.csrf({
        type: 'session',
        id: active.context.session.id,
        seed: active.context.session.csrf_seed,
        keyVersion: active.context.session.csrf_key_version,
      }),
    };
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
    const token = this.browser.readCookie(request);
    if (!token) throw new UnauthorizedException();
    const context = await this.refresh.presented(token);
    await this.limiter.consume('REFRESH', context.session.id);
    this.browser.requireCsrf(request, {
      type: 'session',
      id: context.session.id,
      seed: context.session.csrf_seed,
      keyVersion: context.session.csrf_key_version,
    });
    const rotated = await this.refresh.rotate(token);
    this.browser.writeCookie(response, rotated.refreshToken, rotated.expiresAt);
    return {
      accessToken: rotated.accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: 900 as const,
      csrfToken: this.browser.csrf({
        type: 'session',
        id: rotated.sessionId,
        seed: rotated.csrfSeed,
        keyVersion: rotated.csrfKeyVersion,
      }),
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
    const active = await this.active(request);
    if (active) {
      this.browser.requireCsrf(request, {
        type: 'session',
        id: active.context.session.id,
        seed: active.context.session.csrf_seed,
        keyVersion: active.context.session.csrf_key_version,
      });
      await this.refresh.revokeCurrent(active.token);
    }
    this.browser.clearCookie(response);
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
    this.browser.clearCookie(response);
  }
}
