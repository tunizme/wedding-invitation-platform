import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { isEmail } from 'class-validator';
import { Public } from '../authorization/auth.guard';
import { BrowserSecurityService } from '../auth/browser-security.service';
import { RateLimitService } from '../infrastructure/rate-limit.service';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { ChallengeService } from './challenge.service';
import { LocalVerificationService } from './local-verification.service';
import { PasswordResetService } from './password-reset.service';

function fields(body: unknown, keys: string[]): Record<string, string> {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !keys.includes(key)) ||
    keys.some(
      (key) => typeof (body as Record<string, unknown>)[key] !== 'string',
    )
  )
    throw new UnprocessableEntityException();
  return body as Record<string, string>;
}
function emailInput(body: unknown) {
  const { email: raw } = fields(body, ['email']);
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !isEmail(email))
    throw new UnprocessableEntityException();
  return email;
}
const accepted = {
  message:
    'If the request is eligible, follow the instructions sent to the email address.',
};
@Controller('auth')
@Public()
export class VerificationController {
  constructor(
    @Inject(LocalVerificationService)
    private readonly verification: LocalVerificationService,
    @Inject(PasswordResetService) private readonly reset: PasswordResetService,
    @Inject(ChallengeService) private readonly challenges: ChallengeService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
    @Inject(BrowserSecurityService)
    private readonly browser: BrowserSecurityService,
    @Inject(CredentialCrypto) private readonly crypto: CredentialCrypto,
    @Inject(DataSource) private readonly db: DataSource,
  ) {}
  private async requestInput(body: unknown, request: Request, reset: boolean) {
    this.browser.requireOrigin(request, true);
    const email = emailInput(body);
    await this.limiter.consume(
      reset ? 'RESET_REQUEST_IP' : 'VERIFY_REQUEST_IP',
      this.limiter.ip(request),
    );
    await this.limiter.consume(
      reset ? 'RESET_REQUEST_EMAIL' : 'VERIFY_REQUEST_EMAIL',
      email,
    );
    return email;
  }
  private async confirmInput(body: unknown, request: Request, reset: boolean) {
    this.browser.requireOrigin(request, true);
    const input = fields(body, reset ? ['proof', 'newPassword'] : ['proof']);
    if (input.proof.length < 40 || input.proof.length > 512)
      throw new UnprocessableEntityException();
    if (reset) {
      try {
        this.crypto.validatePassword(input.newPassword);
      } catch {
        throw new UnprocessableEntityException();
      }
    }
    const known = await this.challenges.identify(this.db.manager, input.proof);
    // Count outside the business transaction: rejected proof attempts must persist.
    await this.limiter.consumeProof(known?.id, this.limiter.ip(request));
    return input;
  }
  @Post('email-verifications')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async requestVerification(@Body() body: unknown, @Req() request: Request) {
    await this.verification.request(
      await this.requestInput(body, request, false),
    );
    return accepted;
  }
  @Post('password-resets')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async requestReset(@Body() body: unknown, @Req() request: Request) {
    await this.reset.request(await this.requestInput(body, request, true));
    return accepted;
  }
  @Post('email-verifications/confirm')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async confirmVerification(@Body() body: unknown, @Req() request: Request) {
    const { proof } = await this.confirmInput(body, request, false);
    await this.verification.confirm(proof);
  }
  @Post('password-resets/confirm')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async confirmReset(@Body() body: unknown, @Req() request: Request) {
    const { proof, newPassword } = await this.confirmInput(body, request, true);
    await this.reset.confirm(proof, newPassword);
  }
}
