import { createHmac, timingSafeEqual } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';

export interface CsrfContext {
  type: 'session' | 'onboarding';
  id: string;
  seed: Buffer;
  keyVersion: number;
}

export class BrowserSecurityService {
  constructor(private readonly config: IdentityEnvironment) {}

  requireOrigin(request: Pick<Request, 'headers'>, json = false): void {
    if (
      request.headers.origin !== this.config.frontendOrigin ||
      (json &&
        !/^application\/json(?:\s*;|$)/i.test(
          String(request.headers['content-type'] ?? ''),
        ))
    )
      throw new ForbiddenException();
  }

  csrf(context: CsrfContext): string {
    const key = this.config.csrfKeys[context.keyVersion];
    if (!key || context.seed.length !== 32)
      throw new Error('INVALID_CSRF_CONTEXT');
    const hmac = createHmac('sha256', key);
    for (const value of [
      Buffer.from(context.type),
      Buffer.from(context.id),
      context.seed,
    ]) {
      const size = Buffer.alloc(4);
      size.writeUInt32BE(value.length);
      hmac.update(size);
      hmac.update(value);
    }
    return hmac.digest('base64url');
  }

  requireCsrf(request: Pick<Request, 'headers'>, context: CsrfContext): void {
    this.requireOrigin(request);
    const supplied = request.headers['x-csrf-token'];
    const expected = Buffer.from(this.csrf(context));
    if (
      typeof supplied !== 'string' ||
      Buffer.byteLength(supplied) !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), expected)
    )
      throw new ForbiddenException();
  }

  cookieName(kind = 'rt'): string {
    return `${this.config.production ? '__Secure-' : ''}wedding_${kind}`;
  }
  readCookie(
    request: Pick<Request, 'headers'>,
    kind = 'rt',
  ): string | undefined {
    const name = this.cookieName(kind);
    const matches = (request.headers.cookie ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter((item) => item.startsWith(`${name}=`));
    if (matches.length !== 1) return undefined;
    try {
      return decodeURIComponent(matches[0].slice(name.length + 1));
    } catch {
      return undefined;
    }
  }
  writeCookie(
    response: Response,
    token: string,
    expires: Date,
    kind = 'rt',
  ): void {
    response.cookie(this.cookieName(kind), token, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: Math.max(0, expires.getTime() - Date.now()),
    });
  }
  clearCookie(response: Response, kind = 'rt'): void {
    response.cookie(this.cookieName(kind), '', {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 0,
    });
  }
}
