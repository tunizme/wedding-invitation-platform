import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import type { Request, Response } from 'express';
import { Public } from '../authorization/auth.guard';
import { RateLimitService } from '../infrastructure/rate-limit.service';
import { BrowserSecurityService } from './browser-security.service';
import { LocalLoginService } from './local-login.service';

export function headerValue(
  request: Pick<Request, 'headers'>,
  name: string,
): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' && value.length <= 64 ? value : undefined;
}

interface LoginInput {
  email: string;
  password: string;
}

function loginInput(body: unknown): LoginInput {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !['email', 'password'].includes(key))
  )
    throw new UnprocessableEntityException();
  const value = body as Partial<LoginInput>;
  if (typeof value.email !== 'string' || typeof value.password !== 'string')
    throw new UnprocessableEntityException();
  const email = value.email.trim().toLowerCase();
  if (
    email.length > 254 ||
    !isEmail(email) ||
    value.password.length === 0 ||
    [...value.password].length > 128 ||
    Buffer.byteLength(value.password, 'utf8') > 512 ||
    Buffer.from(value.password, 'utf8').toString('utf8') !== value.password
  )
    throw new UnprocessableEntityException();
  return { email, password: value.password };
}

@Controller('auth/login')
@Public()
export class LoginController {
  constructor(
    @Inject(LocalLoginService) private readonly loginService: LocalLoginService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
    @Inject(BrowserSecurityService)
    private readonly browser: BrowserSecurityService,
  ) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.requireOrigin(request, true);
    const input = loginInput(body);
    await this.limiter.consume('LOGIN_IP', this.limiter.ip(request));
    await this.limiter.consume('LOGIN_EMAIL', input.email);
    const contextId = headerValue(request, 'x-auth-context');
    const intentId = headerValue(request, 'x-auth-intent');
    if (!contextId || !intentId) throw new UnprocessableEntityException();
    // 006 CSP-1: execute the reserved LOCAL_LOGIN intent (body allowlist unchanged).
    const { session, user, contextRevision, cleanupNames } =
      await this.loginService.login(input.email, input.password, {
        request,
        contextId,
        intentId,
      });
    this.browser.clearProtocolNames(response, cleanupNames);
    this.browser.writeSlot(
      response,
      session.slotTag ?? '',
      session.refreshToken,
      session.expiresAt,
    );
    return {
      authProtocol: 2 as const,
      accessToken: session.accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: 900 as const,
      csrfToken: this.browser.csrf({
        type: 'session',
        id: session.sessionId,
        seed: session.csrfSeed,
        keyVersion: session.csrfKeyVersion,
      }),
      sessionTag: session.slotTag,
      contextRevision,
      user,
    };
  }
}
