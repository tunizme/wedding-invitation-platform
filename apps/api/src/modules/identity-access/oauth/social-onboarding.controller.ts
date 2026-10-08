import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { CompleteSocialOnboardingService } from '../application/complete-social-onboarding.service';
import { BrowserSecurityService } from '../auth/browser-security.service';
import { Public } from '../authorization/auth.guard';
import { RateLimitService } from '../infrastructure/rate-limit.service';
import { ChallengeService } from '../verification/challenge.service';
import { SocialOnboardingService } from './social-onboarding.service';

const accepted = {
  message:
    'If the request is eligible, follow the instructions sent to the email address.',
};

@Controller('auth/social-onboarding')
@Public()
export class SocialOnboardingController {
  constructor(
    @Inject(SocialOnboardingService)
    private readonly onboarding: SocialOnboardingService,
    @Inject(CompleteSocialOnboardingService)
    private readonly completion: CompleteSocialOnboardingService,
    @Inject(BrowserSecurityService)
    private readonly browser: BrowserSecurityService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
    @Inject(ChallengeService) private readonly challenges: ChallengeService,
    @Inject(DataSource) private readonly db: DataSource,
  ) {}

  private binding(request: Request) {
    const binding = this.browser.readCookie(request, 'ob');
    if (!binding) throw new UnauthorizedException();
    return binding;
  }

  private async context(request: Request) {
    return this.onboarding.resolve(this.binding(request));
  }

  private csrf(
    request: Request,
    context: Awaited<ReturnType<typeof this.context>>,
  ) {
    this.browser.requireCsrf(request, {
      type: 'onboarding',
      id: context.id,
      seed: context.csrf_seed,
      keyVersion: context.csrf_key_version,
    });
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async get(@Req() request: Request) {
    const context = await this.context(request);
    return {
      contextId: context.context_id,
      provider: context.provider,
      status: context.status,
      emailCandidate: context.email_candidate,
      expiresAt: context.expires_at.toISOString(),
      csrfToken: this.browser.csrf({
        type: 'onboarding',
        id: context.id,
        seed: context.csrf_seed,
        keyVersion: context.csrf_key_version,
      }),
    };
  }

  @Post('email')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async email(@Body() body: unknown, @Req() request: Request) {
    this.browser.requireOrigin(request, true);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'email') ||
      typeof (body as { email?: unknown }).email !== 'string'
    )
      throw new UnprocessableEntityException();
    const email = (body as { email: string }).email.trim().toLowerCase();
    if (email.length > 254 || !isEmail(email))
      throw new UnprocessableEntityException();
    const context = await this.context(request);
    this.csrf(request, context);
    await this.limiter.consume('VERIFY_REQUEST_IP', this.limiter.ip(request));
    await this.limiter.consume('VERIFY_REQUEST_EMAIL', email);
    await this.onboarding.submitEmail(this.binding(request), email);
    return accepted;
  }

  @Post('verifications')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async resend(@Req() request: Request) {
    this.browser.requireOrigin(request);
    const context = await this.context(request);
    this.csrf(request, context);
    await this.limiter.consume('VERIFY_REQUEST_IP', this.limiter.ip(request));
    if (context.email_candidate)
      await this.limiter.consume(
        'VERIFY_REQUEST_EMAIL',
        context.email_candidate,
      );
    await this.onboarding.resend(this.binding(request));
    return accepted;
  }

  @Post('verifications/confirm')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async confirm(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.requireOrigin(request, true);
    const contextId = request.headers['x-auth-context'];
    const intentId = request.headers['x-auth-intent'];
    if (typeof contextId !== 'string' || typeof intentId !== 'string')
      throw new UnprocessableEntityException();
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'proof') ||
      typeof (body as { proof?: unknown }).proof !== 'string'
    )
      throw new UnprocessableEntityException();
    const proof = (body as { proof: string }).proof;
    if (proof.length < 40 || proof.length > 512)
      throw new UnprocessableEntityException();
    const context = await this.context(request);
    this.csrf(request, context);
    const known = await this.challenges.identify(this.db.manager, proof);
    await this.limiter.consumeProof(known?.id, this.limiter.ip(request));
    const result = await this.completion.complete(
      this.binding(request),
      proof,
      request,
      contextId,
      intentId,
    );
    this.browser.clearProtocolNames(response, result.cleanupNames ?? []);
    if (result.session.slotTag) {
      this.browser.writeSlot(
        response,
        result.session.slotTag,
        result.session.refreshToken,
        result.session.expiresAt,
      );
    } else {
      this.browser.writeCookie(
        response,
        result.session.refreshToken,
        result.session.expiresAt,
      );
    }
    this.browser.clearCookie(response, 'ob');
    return {
      ...(result.session.slotTag
        ? {
            authProtocol: 2 as const,
            sessionTag: result.session.slotTag,
            contextRevision: result.contextRevision,
          }
        : {}),
      accessToken: result.session.accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: 900 as const,
      csrfToken: this.browser.csrf({
        type: 'session',
        id: result.session.sessionId,
        seed: result.session.csrfSeed,
        keyVersion: result.session.csrfKeyVersion,
      }),
      user: result.user,
    };
  }
}
