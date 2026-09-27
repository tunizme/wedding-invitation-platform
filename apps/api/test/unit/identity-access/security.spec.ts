import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { IsString } from 'class-validator';
import { requestValidationPipe } from '../../../src/common/errors/validation';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { validateIdentityEnvironment } from '../../../src/config/identity-access.environment';
import { CredentialCrypto } from '../../../src/modules/identity-access/infrastructure/credential-crypto';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import {
  AuthGuard,
  Public,
} from '../../../src/modules/identity-access/authorization/auth.guard';
import {
  RolesGuard,
  Roles,
} from '../../../src/modules/identity-access/authorization/roles.guard';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const values = {
  NODE_ENV: 'test',
  IAM_JWT_ISSUER: 'https://api.example.test',
  IAM_JWT_AUDIENCE: 'wedding',
  IAM_JWT_KID: 'test-1',
  IAM_JWT_PRIVATE_KEY: pair.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString(),
  IAM_JWT_PUBLIC_KEYS: JSON.stringify({
    'test-1': pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }),
  IAM_REFRESH_KEYS: JSON.stringify({
    '1': Buffer.alloc(32, 1).toString('base64'),
  }),
  IAM_CSRF_KEYS: JSON.stringify({
    '1': Buffer.alloc(32, 2).toString('base64'),
  }),
  IAM_ENCRYPTION_KEYS: JSON.stringify({
    '1': Buffer.alloc(32, 3).toString('base64'),
  }),
  IAM_RATE_KEYS: JSON.stringify({
    '1': Buffer.alloc(32, 4).toString('base64'),
  }),
  FRONTEND_ORIGIN: 'http://localhost:3000',
  API_PUBLIC_ORIGIN: 'http://localhost:3001',
};

describe('IAM security primitives', () => {
  it('rejects unknown privilege fields without echoing values', async () => {
    class Input {
      @IsString() name!: string;
    }
    const pipe = requestValidationPipe();
    await expect(
      pipe.transform(
        { name: 'name', role: 'ADMIN', password: 'sensitive-value' },
        { type: 'body', metatype: Input },
      ),
    ).rejects.toMatchObject({ status: 422 });
    try {
      await pipe.transform(
        { name: { secret: 'sensitive-value' } },
        { type: 'body', metatype: Input },
      );
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('sensitive-value');
    }
    await expect(
      pipe.transform({ name: 'name' }, { type: 'body', metatype: Input }),
    ).resolves.toMatchObject({ name: 'name' });
  });
  it('rejects lifetime extensions and rate-limit weakening', () => {
    expect(() =>
      validateIdentityEnvironment({ ...values, IAM_TTL_ACCESS: '901' }),
    ).toThrow('IAM_TTL_ACCESS');
    expect(() =>
      validateIdentityEnvironment({ ...values, IAM_RATE_LOGIN_IP: '11' }),
    ).toThrow('IAM_RATE_LOGIN_IP');
    expect(
      validateIdentityEnvironment({ ...values, IAM_RATE_LOGIN_IP: '3' }).rates
        .LOGIN_IP.limit,
    ).toBe(3);
  });
  it('protects routes by default and takes role only from a verified immutable principal', () => {
    class ProtectedController {}
    class PublicController {}
    class AdminController {}
    Public()(PublicController);
    Roles('ADMIN')(AdminController);
    const tokens = new AccessTokenService(validateIdentityEnvironment(values));
    const reflector = new Reflector();
    const guard = new AuthGuard(reflector, tokens);
    const roles = new RolesGuard(reflector);
    const request: {
      headers: Record<string, string>;
      principal?: unknown;
      body: unknown;
    } = { headers: {}, body: { role: 'ADMIN' } };
    const context = (controller: typeof ProtectedController) =>
      ({
        getHandler: () => function handler() {},
        getClass: () => controller,
        switchToHttp: () => ({ getRequest: () => request }),
      }) as unknown as ExecutionContext;
    expect(() => guard.canActivate(context(ProtectedController))).toThrow();
    expect(guard.canActivate(context(PublicController))).toBe(true);
    request.headers.authorization = `Bearer ${tokens.issue({ sub: randomUUID(), sid: randomUUID(), role: 'CUSTOMER' })}`;
    expect(guard.canActivate(context(ProtectedController))).toBe(true);
    expect(Object.isFrozen(request.principal)).toBe(true);
    expect(() => {
      request.principal = { role: 'ADMIN' };
    }).toThrow();
    expect(() => roles.canActivate(context(AdminController))).toThrow();
  });
  it('derives stable domain-separated CSRF and rejects missing or foreign Origin', () => {
    const browser = new BrowserSecurityService(
      validateIdentityEnvironment(values),
    );
    const context = {
      type: 'session' as const,
      id: randomUUID(),
      seed: Buffer.alloc(32, 10),
      keyVersion: 1,
    };
    const token = browser.csrf(context);
    expect(browser.csrf({ ...context })).toBe(token);
    expect(browser.csrf({ ...context, type: 'onboarding' })).not.toBe(token);
    expect(browser.csrf({ ...context, id: randomUUID() })).not.toBe(token);
    expect(() =>
      browser.requireCsrf(
        { headers: { origin: values.FRONTEND_ORIGIN, 'x-csrf-token': token } },
        context,
      ),
    ).not.toThrow();
    expect(() =>
      browser.requireCsrf({ headers: { 'x-csrf-token': token } }, context),
    ).toThrow();
    expect(() =>
      browser.requireCsrf(
        {
          headers: {
            origin: values.FRONTEND_ORIGIN + '.evil',
            'x-csrf-token': token,
          },
        },
        context,
      ),
    ).toThrow();
    expect(() =>
      browser.requireOrigin(
        {
          headers: {
            origin: values.FRONTEND_ORIGIN,
            'content-type': 'text/plain',
          },
        },
        true,
      ),
    ).toThrow();
    expect(
      browser.readCookie({
        headers: { cookie: 'wedding_rt=one; wedding_rt=two' },
      }),
    ).toBeUndefined();
  });
  it('allows disabled providers without real secrets and fails closed on missing keys', () => {
    expect(validateIdentityEnvironment(values).googleEnabled).toBe(false);
    expect(
      validateIdentityEnvironment({
        ...values,
        IAM_GOOGLE_ENABLED: 'true',
        IAM_GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
        IAM_GOOGLE_CLIENT_SECRET: 'test-client-secret',
      }),
    ).toMatchObject({
      googleEnabled: true,
      googleClientId: 'test-client.apps.googleusercontent.com',
      googleClientSecret: 'test-client-secret',
    });
    expect(() =>
      validateIdentityEnvironment({
        ...values,
        IAM_JWT_PRIVATE_KEY: undefined,
      }),
    ).toThrow(/IAM_JWT_PRIVATE_KEY/);
    expect(() =>
      validateIdentityEnvironment({ ...values, NODE_ENV: 'production' }),
    ).toThrow();
    expect(() =>
      validateIdentityEnvironment({ ...values, FRONTEND_ORIGIN: '*' }),
    ).toThrow();
    expect(() =>
      validateIdentityEnvironment({ ...values, IAM_GOOGLE_ENABLED: 'true' }),
    ).toThrow();
  });

  it('rejects malformed keys without echoing their contents', () => {
    expect(() =>
      validateIdentityEnvironment({
        ...values,
        IAM_REFRESH_KEYS: 'sensitive-invalid-value',
      }),
    ).toThrow(/^Invalid IAM configuration: IAM_REFRESH_KEYS$/);
    expect(() =>
      validateIdentityEnvironment({ ...values, IAM_KEY_VERSION: '2' }),
    ).toThrow();
  });

  it('preserves password whitespace, case and Unicode, with explicit length rejection', async () => {
    const crypto = new CredentialCrypto(validateIdentityEnvironment(values));
    const password = '  Mật Khẩu 🔒  ';
    const hash = await crypto.hashPassword(password);
    expect(hash.split('$').slice(1, 3)).toEqual(['argon2id', 'v=19']);
    expect(hash.split('$')[3].split(',').sort()).toEqual([
      'm=19456',
      'p=1',
      't=2',
    ]);
    expect(await crypto.verifyPassword(hash, password)).toBe(true);
    expect(await crypto.verifyPassword(hash, password.trim())).toBe(false);
    expect(await crypto.verifyPassword(hash, password.toLowerCase())).toBe(
      false,
    );
    await expect(crypto.hashPassword('a'.repeat(7))).rejects.toThrow();
    await expect(crypto.hashPassword('🔒'.repeat(129))).rejects.toThrow();
    expect(
      await crypto.verifyPassword(
        await crypto.hashPassword('🔒'.repeat(128)),
        '🔒'.repeat(128),
      ),
    ).toBe(true);
  });

  it('uses random opaque credentials and authenticated, context-bound encryption', () => {
    const crypto = new CredentialCrypto(validateIdentityEnvironment(values));
    const token = crypto.randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(crypto.randomToken()).not.toBe(token);
    expect(crypto.refreshDigest(token, 1)).toHaveLength(32);
    const encrypted = crypto.encrypt(token, 'outbox:1');
    expect(encrypted.ciphertext.includes(Buffer.from(token))).toBe(false);
    expect(crypto.decrypt(encrypted, 'outbox:1')).toBe(token);
    expect(() => crypto.decrypt(encrypted, 'outbox:2')).toThrow();
    encrypted.ciphertext[15] ^= 1;
    expect(() => crypto.decrypt(encrypted, 'outbox:1')).toThrow();
  });

  it('pins JWT claims/header and expires exactly at iat + 900', () => {
    const service = new AccessTokenService(validateIdentityEnvironment(values));
    const principal = {
      sub: randomUUID(),
      sid: randomUUID(),
      role: 'CUSTOMER' as const,
    };
    const token = service.issue(principal, 1000);
    expect(service.verify(token, 1899)).toMatchObject({
      userId: principal.sub,
      sessionId: principal.sid,
      role: principal.role,
    });
    expect(Object.isFrozen(service.verify(token, 1899))).toBe(true);
    expect(() => service.verify(token, 1900)).toThrow();
    expect(() => service.verify(token, 1901)).toThrow();
    const decoded = jwt.decode(token, { complete: true })!;
    expect(decoded.header).toMatchObject({
      alg: 'RS256',
      typ: 'at+jwt',
      kid: 'test-1',
    });
    for (const changes of [
      { iss: 'other' },
      { aud: 'other' },
      { exp: 1901 },
      { role: 'ROOT' },
      { sid: 'invalid' },
      { iat: 1100, exp: 2000 },
    ]) {
      const forged = jwt.sign(
        { ...(decoded.payload as object), ...changes },
        pair.privateKey,
        {
          algorithm: 'RS256',
          header: { alg: 'RS256', typ: 'at+jwt', kid: 'test-1' },
        },
      );
      expect(() => service.verify(forged, 1000)).toThrow();
    }
    for (const header of [
      { alg: 'RS256', typ: 'JWT', kid: 'test-1' },
      { alg: 'RS256', typ: 'at+jwt', kid: 'unknown' },
    ]) {
      expect(() =>
        service.verify(
          jwt.sign(decoded.payload, pair.privateKey, {
            algorithm: 'RS256',
            header,
          }),
          1000,
        ),
      ).toThrow();
    }
    expect(() =>
      service.verify(
        jwt.sign(decoded.payload, 'attacker-secret', { algorithm: 'HS256' }),
        1000,
      ),
    ).toThrow();
  });
});
