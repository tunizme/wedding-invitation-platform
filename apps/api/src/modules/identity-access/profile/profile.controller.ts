import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../authorization/auth.guard';
import { BrowserSecurityService } from '../auth/browser-security.service';
import { RateLimitService } from '../infrastructure/rate-limit.service';
import { ChangePasswordService } from './change-password.service';
import { ProfileService, type ProfileUpdate } from './profile.service';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new UnprocessableEntityException();
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new UnprocessableEntityException();
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].length > maximum)
    throw new UnprocessableEntityException();
  return trimmed;
}

function profileUpdate(body: unknown): ProfileUpdate {
  const value = object(body);
  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some((key) => !['displayName', 'phoneNumber'].includes(key))
  )
    throw new UnprocessableEntityException();
  const update: ProfileUpdate = {};
  if (Object.hasOwn(value, 'displayName'))
    update.displayName = optionalText(value.displayName, 100);
  if (Object.hasOwn(value, 'phoneNumber'))
    update.phoneNumber = optionalText(value.phoneNumber, 32);
  return update;
}

function passwordChange(body: unknown) {
  const value = object(body);
  if (
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'currentPassword') ||
    !Object.hasOwn(value, 'newPassword') ||
    typeof value.currentPassword !== 'string' ||
    typeof value.newPassword !== 'string' ||
    [...value.currentPassword].length < 1 ||
    [...value.currentPassword].length > 128 ||
    Buffer.byteLength(value.currentPassword, 'utf8') > 512 ||
    Buffer.from(value.currentPassword, 'utf8').toString('utf8') !==
      value.currentPassword ||
    [...value.newPassword].length < 8 ||
    [...value.newPassword].length > 128 ||
    Buffer.byteLength(value.newPassword, 'utf8') > 512 ||
    Buffer.from(value.newPassword, 'utf8').toString('utf8') !==
      value.newPassword
  )
    throw new UnprocessableEntityException();
  return {
    currentPassword: value.currentPassword,
    newPassword: value.newPassword,
  };
}

@Controller('me')
export class ProfileController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(ChangePasswordService)
    private readonly passwords: ChangePasswordService,
    @Inject(BrowserSecurityService)
    private readonly browser: BrowserSecurityService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
  ) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.profiles.get(request.principal.userId);
  }

  @Patch()
  update(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.profiles.update(request.principal.userId, profileUpdate(body));
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = passwordChange(body);
    await this.limiter.consume('PASSWORD_CHANGE', request.principal.userId);
    await this.passwords.change(
      request.principal.userId,
      input.currentPassword,
      input.newPassword,
    );
    this.browser.clearCookie(response);
  }
}
