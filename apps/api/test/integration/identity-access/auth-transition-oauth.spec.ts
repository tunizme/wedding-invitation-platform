import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import { ResolveSocialIdentityService } from '../../../src/modules/identity-access/application/resolve-social-identity.service';
import { SocialOnboardingService } from '../../../src/modules/identity-access/oauth/social-onboarding.service';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { AuthContextService } from '../../../src/modules/identity-access/context/auth-context.service';
import { AuthIntentService } from '../../../src/modules/identity-access/context/auth-intent.service';
import { CookieLedgerService } from '../../../src/modules/identity-access/context/cookie-ledger.service';
import { OAuthTransactionService } from '../../../src/modules/identity-access/oauth/oauth-transaction.service';
import { transaction } from '../../../src/modules/identity-access/infrastructure/transactions';
import { registrationFixture } from '../../registration-fixture';

/** 006 T050: OAuth transaction start is single-use and bound to current context intent. */
describe.sequential('OAuth intent binding integration', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let browser: BrowserSecurityService;
  let contexts: AuthContextService;
  let intents: AuthIntentService;
  let oauth: OAuthTransactionService;

  beforeAll(async () => {
    fixture = await registrationFixture();
    browser = new BrowserSecurityService(fixture.config);
    contexts = new AuthContextService(
      fixture.db,
      fixture.config,
      fixture.crypto,
      browser,
      new CookieLedgerService(fixture.config, fixture.crypto),
    );
    intents = new AuthIntentService(fixture.db, fixture.config, contexts);
    oauth = new OAuthTransactionService(
      fixture.db,
      fixture.config,
      fixture.crypto,
      contexts,
      intents,
    );
  });
  beforeEach(async () => {
    await fixture.clear();
    await fixture.db.query(
      'TRUNCATE auth_cookie_names,auth_intents,auth_contexts CASCADE',
    );
  });
  afterAll(async () => fixture?.close());

  async function activeContext() {
    const provision = await contexts.provision({
      headers: { cookie: '' },
      ip: '127.0.0.1',
    });
    const jar = new Map([
      [browser.bindingCookieName(provision.contextId), provision.secret],
    ]);
    const request = (contextId: string) => ({
      headers: {
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
        'x-auth-context': contextId,
      },
      ip: '127.0.0.1',
    });
    await contexts.confirm(request(provision.contextId), provision.contextId);
    return { contextId: provision.contextId, request };
  }

  it('stores intent_id on start, rejects a second start, and preserves claim binding', async () => {
    const context = await activeContext();
    const reserved = await intents.reserve(
      context.request(context.contextId),
      context.contextId,
      {
        kind: 'OAUTH',
        expectedRevision: 0,
      },
    );
    const started = await oauth.start(
      'GOOGLE',
      'OAUTH_RESULT',
      context.request(context.contextId),
      reserved.intentId,
    );
    const [row] = await fixture.db.query<
      { context_id: string; intent_id: string; status: string }[]
    >(
      'SELECT i.context_id,t.intent_id,t.status FROM oauth_transactions t JOIN auth_intents i ON i.id=t.intent_id WHERE t.id=$1',
      [started.id],
    );
    expect(row).toMatchObject({
      context_id: context.contextId,
      intent_id: reserved.intentId,
      status: 'PENDING',
    });
    await expect(
      oauth.start(
        'GOOGLE',
        'OAUTH_RESULT',
        context.request(context.contextId),
        reserved.intentId,
      ),
    ).rejects.toThrow();
    const claimed = await oauth.claim('GOOGLE', started.state, started.binding);
    expect(claimed).toMatchObject({
      id: started.id,
      contextId: context.contextId,
      intentId: reserved.intentId,
    });
    // T099: observe real PostgreSQL callback writes, including implicit UPDATE
    // row locks. No business relation may be written after the ledger lock.
    const writes: { sql: string; afterLedger: boolean }[] = [];
    let ledgerLocked = false;
    const original = fixture.db.createQueryRunner.bind(fixture.db);
    const spy = vi
      .spyOn(fixture.db, 'createQueryRunner')
      .mockImplementation((mode) => {
        const runner = original(mode);
        const query = runner.query.bind(runner);
        runner.query = (async (sql: string, ...args: unknown[]) => {
          if (
            /pg_advisory_xact_lock/.test(sql) &&
            String((args[0] as unknown[] | undefined)?.[0]).startsWith(
              'wa-cookie-group:',
            )
          )
            ledgerLocked = true;
          if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))
            writes.push({ sql, afterLedger: ledgerLocked });
          const result: unknown = await query(sql, ...(args as [unknown[]]));
          return result;
        }) as typeof runner.query;
        return runner;
      });
    try {
      const resolver = new ResolveSocialIdentityService(
        fixture.db,
        new SessionService(
          fixture.config,
          fixture.crypto,
          new AccessTokenService(fixture.config),
        ),
        new SocialOnboardingService(fixture.db, fixture.config, fixture.crypto),
        oauth,
        contexts,
        intents,
      );
      const result = await resolver.resolveClaimed(
        {
          provider: 'GOOGLE',
          subject: 'lock-order-current',
          email: 'lock-order@example.test',
          emailVerified: true,
          displayName: 'Current',
          avatarUrl: null,
        },
        claimed,
        context.request(context.contextId),
      );
      expect(result.kind).toBe('session');
      expect(ledgerLocked).toBe(true);
      expect(
        writes.some(({ sql }) => /^UPDATE oauth_transactions/i.test(sql)),
      ).toBe(true);
      expect(
        writes.filter(
          ({ sql, afterLedger }) =>
            afterLedger && !/auth_cookie_names/i.test(sql),
        ),
      ).toEqual([]);
      const [completed] = await fixture.db.query<
        { status: string; pkce_verifier_ciphertext: Buffer | null }[]
      >(
        'SELECT status,pkce_verifier_ciphertext FROM oauth_transactions WHERE id=$1',
        [started.id],
      );
      expect(completed).toEqual({
        status: 'CONSUMED',
        pkce_verifier_ciphertext: null,
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('fails the final authority check after a newer intent supersedes OAuth', async () => {
    const context = await activeContext();
    const oauthIntent = await intents.reserve(
      context.request(context.contextId),
      context.contextId,
      {
        kind: 'OAUTH',
        expectedRevision: 0,
      },
    );
    const started = await oauth.start(
      'GOOGLE',
      'OAUTH_RESULT',
      context.request(context.contextId),
      oauthIntent.intentId,
    );
    await intents.reserve(
      context.request(context.contextId),
      context.contextId,
      {
        kind: 'LOCAL_LOGIN',
        expectedRevision: 1,
      },
    );
    const claimed = await oauth.claim('GOOGLE', started.state, started.binding);
    await expect(
      transaction(fixture.db, async (manager) => {
        const bound = await contexts.bind(
          manager,
          context.request(context.contextId),
          context.contextId,
        );
        await intents.assertCurrent(manager, bound, claimed.intentId!, 'OAUTH');
      }),
    ).rejects.toMatchObject({ problemCode: 'SUPERSEDED' });
  });
});
