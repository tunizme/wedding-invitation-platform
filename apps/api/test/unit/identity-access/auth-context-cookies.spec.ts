import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { validateIdentityEnvironment } from '../../../src/config/identity-access.environment';
import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { identityFixture } from '../../identity-fixture';

const contextId = '0f0e5a2c-6b1d-4c6a-9a51-2a4a0b6f9d10';
const tag = 'AbCdEfGhIjKlMnOpQrStUv';

function service(production = false) {
  const config = validateIdentityEnvironment(identityFixture());
  return new BrowserSecurityService({ ...config, production });
}

function recorder() {
  const calls: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];
  const response = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      calls.push({ name, value, options });
      return response;
    },
  } as unknown as Response;
  return { response, calls };
}

describe('006 cookie helpers', () => {
  it('names cookies with production prefixes and dev fallbacks', () => {
    expect(service(true).bindingCookieName(contextId)).toBe(
      `__Host-wa_cb_${contextId}`,
    );
    expect(service(true).slotCookieName(tag)).toBe(`__Secure-wa_s_${tag}`);
    expect(service().bindingCookieName(contextId)).toBe(`wa_cb_${contextId}`);
    expect(service().slotCookieName(tag)).toBe(`wa_s_${tag}`);
  });

  it('reads exactly one value and fails closed on duplicates or malformed values', () => {
    const browser = service();
    const name = browser.slotCookieName(tag);
    expect(
      browser.readExactlyOne(
        { headers: { cookie: `${name}=abc_DEF-1` } },
        name,
      ),
    ).toBe('abc_DEF-1');
    expect(
      browser.readExactlyOne(
        { headers: { cookie: `${name}=a; ${name}=b` } },
        name,
      ),
    ).toBeUndefined();
    expect(
      browser.readExactlyOne({ headers: { cookie: `${name}=a%ZZ` } }, name),
    ).toBeUndefined();
    expect(
      browser.readExactlyOne({ headers: { cookie: `${name}=a.b` } }, name),
    ).toBeUndefined();
    expect(browser.readExactlyOne({ headers: {} }, name)).toBeUndefined();
  });

  it('lists only protocol cookies and withholds values of duplicates', () => {
    const browser = service();
    const binding = browser.bindingCookieName(contextId);
    const slot = browser.slotCookieName(tag);
    const result = browser.protocolCookies({
      headers: {
        cookie: `other=1; ${binding}=sec; ${slot}=v1; ${slot}=v2; wedding_rt=legacy`,
      },
    });
    expect(result.bindings).toEqual([
      {
        name: binding,
        contextId,
        value: 'sec',
        bytes: `${binding}=sec`.length,
      },
    ]);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]).toMatchObject({ name: slot, slotTag: tag });
    expect(result.slots[0].value).toBeUndefined();
  });

  it('writes binding at Path=/ and slots at the auth path, HttpOnly SameSite=Lax', () => {
    const { response, calls } = recorder();
    const browser = service(true);
    browser.writeBinding(response, contextId, 'secret', 900);
    browser.writeSlot(response, tag, 'token', new Date(Date.now() + 60_000));
    browser.clearSlot(response, tag);
    browser.clearBinding(response, contextId);
    expect(calls[0]).toMatchObject({
      name: `__Host-wa_cb_${contextId}`,
      options: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 900_000,
      },
    });
    expect(calls[0].options).not.toHaveProperty('domain');
    expect(calls[1]).toMatchObject({
      name: `__Secure-wa_s_${tag}`,
      options: { httpOnly: true, path: '/api/v1/auth', sameSite: 'lax' },
    });
    expect(calls[2].options).toMatchObject({ maxAge: 0, path: '/api/v1/auth' });
    expect(calls[3].options).toMatchObject({ maxAge: 0, path: '/' });
  });
});
