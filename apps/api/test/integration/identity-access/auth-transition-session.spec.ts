import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { LocalLoginService } from '../../../src/modules/identity-access/auth/local-login.service';
import { RefreshService } from '../../../src/modules/identity-access/auth/refresh.service';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import { AuthContextService } from '../../../src/modules/identity-access/context/auth-context.service';
import { AuthIntentService } from '../../../src/modules/identity-access/context/auth-intent.service';
import { CookieLedgerService } from '../../../src/modules/identity-access/context/cookie-ledger.service';
import { transaction } from '../../../src/modules/identity-access/infrastructure/transactions';
import { registrationFixture } from '../../registration-fixture';

const PASSWORD = 'Integration Password';
type Jar = Map<string, string>;
const req = (
  jar: Jar,
  contextId: string,
  extra: Record<string, string> = {},
) => ({
  headers: {
    cookie: [...jar].map(([n, v]) => `${n}=${v}`).join('; '),
    'x-auth-context': contextId,
    ...extra,
  },
  ip: '127.0.0.1',
});

/** 006 T028: late effects only touch their own session (P02-a/P02-b). */
describe.sequential('auth transition session services', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let browser: BrowserSecurityService;
  let contexts: AuthContextService;
  let intents: AuthIntentService;
  let login: LocalLoginService;
  let refresh: RefreshService;

  beforeAll(async () => {
    fixture = await registrationFixture();
    browser = new BrowserSecurityService(fixture.config);
    const ledger = new CookieLedgerService(fixture.config, fixture.crypto);
    contexts = new AuthContextService(
      fixture.db,
      fixture.config,
      fixture.crypto,
      browser,
      ledger,
    );
    intents = new AuthIntentService(fixture.db, fixture.config, contexts);
    const tokens = new AccessTokenService(fixture.config);
    const sessions = new SessionService(fixture.config, fixture.crypto, tokens);
    login = new LocalLoginService(
      fixture.db,
      fixture.crypto,
      sessions,
      contexts,
      intents,
      browser,
    );
    refresh = new RefreshService(
      fixture.db,
      fixture.config,
      fixture.crypto,
      tokens,
      contexts,
      browser,
    );
  });
  beforeEach(async () => {
    await fixture.clear();
    await fixture.db.query(
      'TRUNCATE auth_cookie_names, auth_intents, auth_contexts CASCADE',
    );
    for (const email of ['a@example.test', 'b@example.test'])
      await fixture.db.query(
        `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
         VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now())`,
        [email, await fixture.crypto.hashPassword(PASSWORD)],
      );
  });
  afterAll(async () => fixture?.close());

  async function activeContext() {
    const jar: Jar = new Map();
    const p = await contexts.provision({
      headers: { cookie: '' },
      ip: '127.0.0.1',
    });
    jar.set(browser.bindingCookieName(p.contextId), p.secret);
    await contexts.confirm(req(jar, p.contextId), p.contextId);
    return { jar, contextId: p.contextId };
  }

  async function loginAs(
    ctx: { jar: Jar; contextId: string },
    email: string,
    revision: number,
  ) {
    const intent = await intents.reserve(
      req(ctx.jar, ctx.contextId),
      ctx.contextId,
      {
        kind: 'LOCAL_LOGIN',
        expectedRevision: revision,
      },
    );
    const result = await login.login(email, PASSWORD, {
      request: req(ctx.jar, ctx.contextId),
      contextId: ctx.contextId,
      intentId: intent.intentId,
    });
    ctx.jar.set(
      browser.slotCookieName(result.session.slotTag ?? ''),
      result.session.refreshToken,
    );
    return result;
  }

  it('late refresh A committed before B login cannot restore A', async () => {
    const ctx = await activeContext();
    const a = await loginAs(ctx, 'a@example.test', 0);
    const slotA = a.session.slotTag ?? '';
    // A refresh commits (its response is "held": the jar keeps A's old value).
    const rotated = await refresh.rotateCurrent(
      req(ctx.jar, ctx.contextId),
      ctx.contextId,
      slotA,
    );
    expect(rotated.slotTag).toBe(slotA);
    const b = await loginAs(ctx, 'b@example.test', 1);
    // Release the held A response: only A's own slot name changes.
    ctx.jar.set(browser.slotCookieName(slotA), rotated.refreshToken);
    const [row] = await fixture.db.query<{ revocation_reason: string }[]>(
      'SELECT revocation_reason FROM auth_sessions WHERE slot_tag=$1',
      [slotA],
    );
    expect(row.revocation_reason).toBe('SUPERSEDED');
    const renewed = await refresh.rotateCurrent(
      req(ctx.jar, ctx.contextId),
      ctx.contextId,
      b.session.slotTag ?? '',
    );
    expect(renewed.user.email).toBe('b@example.test');
  });

  it('a refresh that arrives after B is rejected without rotating anything', async () => {
    const ctx = await activeContext();
    const a = await loginAs(ctx, 'a@example.test', 0);
    await loginAs(ctx, 'b@example.test', 1);
    await expect(
      refresh.rotateCurrent(
        req(ctx.jar, ctx.contextId),
        ctx.contextId,
        a.session.slotTag ?? '',
      ),
    ).rejects.toMatchObject({ problemCode: 'SUPERSEDED' });
    const [{ count }] = await fixture.db.query<{ count: string }[]>(
      'SELECT count(*)::text AS count FROM refresh_credentials WHERE consumed_at IS NOT NULL',
    );
    expect(count).toBe('0');
  });

  it('records the slot emission in the ledger and acknowledges it on refresh', async () => {
    const ctx = await activeContext();
    const a = await loginAs(ctx, 'a@example.test', 0);
    const name = browser.slotCookieName(a.session.slotTag ?? '');
    const state = async () =>
      (
        await fixture.db.query<{ unresolved_set: boolean }[]>(
          'SELECT unresolved_set FROM auth_cookie_names WHERE name=$1',
          [name],
        )
      )[0];
    expect(await state()).toMatchObject({ unresolved_set: true });
    await transaction(fixture.db, async (manager) => {
      const bound = await contexts.bind(
        manager,
        req(ctx.jar, ctx.contextId),
        ctx.contextId,
      );
      await contexts.settle(manager, bound);
    });
    expect(await state()).toMatchObject({ unresolved_set: false });
  });
});
