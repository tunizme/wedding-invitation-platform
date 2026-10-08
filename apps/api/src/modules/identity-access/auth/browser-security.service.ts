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
  // --- 006 CSP-1 cookies (contracts/browser-state.md §1) -----------------

  bindingCookieName(contextId: string): string {
    return `${this.config.production ? '__Host-' : ''}wa_cb_${contextId}`;
  }

  slotCookieName(slotTag: string): string {
    return `${this.config.production ? '__Secure-' : ''}wa_s_${slotTag}`;
  }

  /** Exactly one cookie with this name, else undefined (fail closed). */
  readExactlyOne(
    request: Pick<Request, 'headers'>,
    name: string,
  ): string | undefined {
    const matches = (request.headers.cookie ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter((item) => item.startsWith(`${name}=`));
    if (matches.length !== 1) return undefined;
    try {
      const value = decodeURIComponent(matches[0].slice(name.length + 1));
      return /^[A-Za-z0-9_-]{1,512}$/.test(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Protocol cookies present on this request. Values are returned only so the
   * ledger can acknowledge exact emissions; callers must never log them.
   * Duplicate names are reported once with `duplicate: true` and no value.
   */
  protocolCookies(request: Pick<Request, 'headers'>): {
    bindings: {
      name: string;
      contextId: string;
      value?: string;
      bytes: number;
    }[];
    slots: { name: string; slotTag: string; value?: string; bytes: number }[];
  } {
    const prefix = this.config.production;
    const bindingRe = new RegExp(
      `^${prefix ? '__Host-' : ''}wa_cb_([0-9a-f-]{36})$`,
    );
    const slotRe = new RegExp(
      `^${prefix ? '__Secure-' : ''}wa_s_([A-Za-z0-9_-]{22})$`,
    );
    const seen = new Map<
      string,
      { value?: string; bytes: number; count: number }
    >();
    for (const item of (request.headers.cookie ?? '').split(';')) {
      const pair = item.trim();
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const name = pair.slice(0, index);
      if (!bindingRe.test(name) && !slotRe.test(name)) continue;
      const entry = seen.get(name);
      if (entry) {
        entry.count += 1;
        continue;
      }
      let value: string | undefined;
      try {
        value = decodeURIComponent(pair.slice(index + 1));
      } catch {
        value = undefined;
      }
      seen.set(name, { value, bytes: Buffer.byteLength(pair), count: 1 });
    }
    const bindings: ReturnType<
      BrowserSecurityService['protocolCookies']
    >['bindings'] = [];
    const slots: ReturnType<
      BrowserSecurityService['protocolCookies']
    >['slots'] = [];
    for (const [name, entry] of seen) {
      const value = entry.count === 1 ? entry.value : undefined;
      const binding = bindingRe.exec(name);
      if (binding)
        bindings.push({
          name,
          contextId: binding[1],
          value,
          bytes: entry.bytes,
        });
      const slot = slotRe.exec(name);
      if (slot)
        slots.push({ name, slotTag: slot[1], value, bytes: entry.bytes });
    }
    return { bindings, slots };
  }

  writeBinding(
    response: Response,
    contextId: string,
    secret: string,
    maxAgeSeconds: number,
  ): void {
    response.cookie(this.bindingCookieName(contextId), secret, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds * 1000,
    });
  }

  clearBinding(response: Response, contextId: string): void {
    response.cookie(this.bindingCookieName(contextId), '', {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  writeSlot(
    response: Response,
    slotTag: string,
    token: string,
    expires: Date,
  ): void {
    response.cookie(this.slotCookieName(slotTag), token, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: Math.max(0, expires.getTime() - Date.now()),
    });
  }

  clearSlot(response: Response, slotTag: string): void {
    response.cookie(this.slotCookieName(slotTag), '', {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 0,
    });
  }

  /** Internal names selected under context locks, never caller-provided wildcard clears. */
  clearProtocolNames(response: Response, names: readonly string[]): void {
    for (const name of new Set(names)) {
      const binding = /^(__Host-)?wa_cb_[0-9a-f-]{36}$/.test(name);
      const slot = /^(__Secure-)?wa_s_[A-Za-z0-9_-]{22}$/.test(name);
      if (!binding && !slot) throw new Error('INVALID_PROTOCOL_CLEANUP_NAME');
      response.cookie(name, '', {
        httpOnly: true,
        secure: this.config.production,
        sameSite: 'lax',
        path: binding ? '/' : '/api/v1/auth',
        maxAge: 0,
      });
    }
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
