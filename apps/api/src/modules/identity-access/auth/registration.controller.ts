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
import { isEmail } from 'class-validator';
import { Public } from '../authorization/auth.guard';
import { RegisterLocalService } from '../application/register-local.service';
import { BrowserSecurityService } from './browser-security.service';
import { RateLimitService } from '../infrastructure/rate-limit.service';

export interface RegisterRequest {
  email: string;
  password: string;
}
function registrationInput(body: unknown): RegisterRequest {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !['email', 'password'].includes(k))
  )
    throw new UnprocessableEntityException();
  const input = body as Partial<RegisterRequest>;
  if (typeof input.email !== 'string' || typeof input.password !== 'string')
    throw new UnprocessableEntityException();
  const email = input.email.trim().toLowerCase(),
    password = input.password;
  if (
    email.length > 254 ||
    !isEmail(email) ||
    [...password].length < 8 ||
    [...password].length > 128 ||
    Buffer.byteLength(password) > 512 ||
    Buffer.from(password).toString() !== password
  )
    throw new UnprocessableEntityException();
  return { email, password };
}
@Controller('auth/registrations')
@Public()
export class RegistrationController {
  constructor(
    @Inject(RegisterLocalService)
    private readonly service: RegisterLocalService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
    @Inject(BrowserSecurityService)
    private readonly browser: BrowserSecurityService,
  ) {}
  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async register(@Body() body: unknown, @Req() request: Request) {
    this.browser.requireOrigin(request, true);
    const input = registrationInput(body);
    await this.limiter.consume('REGISTER_IP', this.limiter.ip(request));
    await this.limiter.consume('REGISTER_EMAIL', input.email);
    await this.service.register(input.email, input.password);
    return {
      message:
        'If the request is eligible, follow the instructions sent to the email address.',
    };
  }
}
