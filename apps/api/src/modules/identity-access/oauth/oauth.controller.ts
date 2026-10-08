import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  IDENTITY_CONFIG,
  type IdentityEnvironment,
} from '../../../config/identity-access.environment';
import { ResolveSocialIdentityService } from '../application/resolve-social-identity.service';
import { BrowserSecurityService } from '../auth/browser-security.service';
import { Public } from '../authorization/auth.guard';
import { RateLimitService } from '../infrastructure/rate-limit.service';
import { GoogleAdapter, GoogleCallbackRejected } from './google.adapter';
import { FacebookAdapter, FacebookCallbackRejected } from './facebook.adapter';
import { OAuthTransactionService } from './oauth-transaction.service';
import { AuthTransitionProblemException } from '../../../common/errors/public-problem.exception';

@Controller('auth/oauth/:provider')
@Public()
export class OAuthController {
  constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnvironment,
    @Inject(OAuthTransactionService)
    private readonly transactions: OAuthTransactionService,
    @Inject(GoogleAdapter) private readonly google: GoogleAdapter,
    @Inject(FacebookAdapter) private readonly facebook: FacebookAdapter,
    @Inject(ResolveSocialIdentityService)
    private readonly identities: ResolveSocialIdentityService,
    @Inject(BrowserSecurityService)
    private readonly browser: BrowserSecurityService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
  ) {}

  private selected(provider: string) {
    if (provider === 'google' && this.config.googleEnabled)
      return { provider: 'GOOGLE' as const, adapter: this.google };
    if (provider === 'facebook' && this.config.facebookEnabled)
      return { provider: 'FACEBOOK' as const, adapter: this.facebook };
    throw new BadRequestException();
  }

  @Get('start')
  async start(
    @Param('provider') provider: string,
    @Query('intent') intentId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const selected = this.selected(provider);
    await this.limiter.consume('OAUTH_START', this.limiter.ip(request));
    if (
      !intentId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        intentId,
      )
    )
      return response.redirect(
        303,
        `${this.config.frontendOrigin}/oauth-result?result=superseded`,
      );
    let started;
    try {
      started = await this.transactions.start(
        selected.provider,
        'OAUTH_RESULT',
        request,
        intentId,
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        (error instanceof AuthTransitionProblemException &&
          ['SUPERSEDED', 'BINDING_INVALID', 'CONTEXT_UNAVAILABLE'].includes(
            error.problemCode,
          ))
      )
        return response.redirect(
          303,
          `${this.config.frontendOrigin}/oauth-result?result=superseded`,
        );
      throw error;
    }
    const location =
      selected.provider === 'GOOGLE'
        ? this.google.authorizationUrl(started)
        : this.facebook.authorizationUrl({ state: started.state });
    this.browser.writeCookie(
      response,
      started.binding,
      started.expiresAt,
      'oauth',
    );
    return response.redirect(302, location);
  }

  @Get('callback')
  async callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const selected = this.selected(provider);
    const state = typeof query.state === 'string' ? query.state : undefined;
    const code = typeof query.code === 'string' ? query.code : undefined;
    const providerError =
      typeof query.error === 'string' ? query.error : undefined;
    if (
      !state ||
      state.length > 512 ||
      (code !== undefined && (code.length < 1 || code.length > 4096)) ||
      (providerError !== undefined && providerError.length > 100) ||
      !!code === !!providerError
    )
      throw new BadRequestException();
    const binding = this.browser.readCookie(request, 'oauth');
    const claimed = await this.transactions.claim(
      selected.provider,
      state,
      binding,
    );
    if (providerError || !code) {
      await this.transactions.fail(claimed.id, 'PROVIDER_CANCELLED');
      this.browser.clearCookie(response, 'oauth');
      throw new BadRequestException();
    }
    if (!claimed.contextId || !claimed.intentId) {
      await this.transactions.fail(claimed.id, 'PRE_CUTOVER_TRANSACTION');
      this.browser.clearCookie(response, 'oauth');
      throw new BadRequestException();
    }
    try {
      const verified =
        selected.provider === 'GOOGLE'
          ? await this.google.verifyCallback({
              code,
              codeVerifier: claimed.codeVerifier,
              expectedNonceHash: claimed.expectedNonceHash,
            })
          : await this.facebook.verifyCallback({ code });
      const result = await this.identities.resolveClaimed(
        verified,
        claimed,
        request,
      );
      this.browser.clearCookie(response, 'oauth');
      if (result.kind === 'onboarding') {
        this.browser.writeCookie(
          response,
          result.onboarding.binding,
          result.onboarding.expiresAt,
          'ob',
        );
        return response.redirect(
          303,
          `${this.config.frontendOrigin}/social-onboarding`,
        );
      }
      this.browser.writeSlot(
        response,
        result.session.slotTag ?? '',
        result.session.refreshToken,
        result.session.expiresAt,
      );
      return response.redirect(
        303,
        `${this.config.frontendOrigin}/oauth-result?result=success&intent=${encodeURIComponent(claimed.intentId)}`,
      );
    } catch (error) {
      await this.transactions.fail(
        claimed.id,
        error instanceof GoogleCallbackRejected ||
          error instanceof FacebookCallbackRejected
          ? error.failureCode
          : 'CALLBACK_REJECTED',
      );
      this.browser.clearCookie(response, 'oauth');
      if (
        error instanceof AuthTransitionProblemException &&
        ['SUPERSEDED', 'BINDING_INVALID', 'CONTEXT_UNAVAILABLE'].includes(
          error.problemCode,
        )
      )
        return response.redirect(
          303,
          `${this.config.frontendOrigin}/oauth-result?result=superseded`,
        );
      throw error;
    }
  }
}
