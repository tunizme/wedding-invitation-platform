import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { LocalLoginService } from '../../../src/modules/identity-access/auth/local-login.service';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import { AuthContextService } from '../../../src/modules/identity-access/context/auth-context.service';
import { AuthIntentService } from '../../../src/modules/identity-access/context/auth-intent.service';
import { CookieLedgerService } from '../../../src/modules/identity-access/context/cookie-ledger.service';
import { transaction } from '../../../src/modules/identity-access/infrastructure/transactions';
import { registrationFixture } from '../../registration-fixture';

/**
 * 006 T010 (L-proof): concurrent context reservation, context-bound session
 * issue, group merge and account-wide revocation never deadlock.
 */
describe.sequential('auth context lock hierarchy', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let browser: BrowserSecurityService;
  let contexts: AuthContextService;
  let intents: AuthIntentService;
  let sessions: SessionService;

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
    sessions = new SessionService(
      fixture.config,
      fixture.crypto,
      new AccessTokenService(fixture.config),
    );
  });
  beforeEach(async () => {
    await fixture.clear();
    await fixture.db.query(
      'TRUNCATE auth_cookie_names, auth_intents, auth_contexts CASCADE',
    );
  });
  afterAll(async () => fixture?.close());

  async function context() {
    const provisioned = await contexts.provision({
      headers: { cookie: '' },
      ip: '127.0.0.1',
    });
    const cookie = `${browser.bindingCookieName(provisioned.contextId)}=${provisioned.secret}`;
    const request = {
      headers: { cookie, 'x-auth-context': provisioned.contextId },
      ip: '127.0.0.1',
    };
    await contexts.confirm(request, provisioned.contextId);
    return { id: provisioned.contextId, request };
  }

  async function user(email: string) {
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,'hash','LOCAL','CUSTOMER','ACTIVE',now(),now(),now()) RETURNING id`,
      [email],
    );
    return id;
  }

  it('locks both issuance users first during opposing account switches in independent contexts', async () => {
    const a = await context();
    const b = await context();
    const users = [
      await user('switch-a@example.test'),
      await user('switch-b@example.test'),
    ];
    for (const [ctx, userId] of [
      [a, users[0]],
      [b, users[1]],
    ] as const)
      await transaction(fixture.db, async (manager) => {
        const bound = await contexts.bind(manager, ctx.request, ctx.id);
        await sessions.issue(manager, userId, { context: bound });
      });
    const reserved = await Promise.all(
      [a, b].map((ctx) =>
        intents.reserve(ctx.request, ctx.id, {
          kind: 'LOCAL_LOGIN',
          expectedRevision: 0,
        }),
      ),
    );
    const login = new LocalLoginService(
      fixture.db,
      fixture.crypto,
      sessions,
      contexts,
      intents,
      browser,
    );
    const verify = vi
      .spyOn(fixture.crypto, 'verifyPassword')
      .mockResolvedValue(true);
    const rehash = vi
      .spyOn(fixture.crypto, 'needsPasswordRehash')
      .mockReturnValue(false);
    const histories: unknown[][] = [];
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = fixture.db.createQueryRunner.bind(fixture.db);
    const spy = vi
      .spyOn(fixture.db, 'createQueryRunner')
      .mockImplementation((mode) => {
        const runner = original(mode);
        const query = runner.query.bind(runner);
        let first = true;
        runner.query = (async (sql: string, ...args: unknown[]) => {
          if (first && /SELECT id FROM users.*FOR UPDATE/i.test(sql)) {
            first = false;
            histories.push((args[0] as unknown[][])[0]);
            arrivals += 1;
            if (arrivals === 2) release();
            await barrier;
          }
          const result: unknown = await query(sql, ...(args as [unknown[]]));
          return result;
        }) as typeof runner.query;
        return runner;
      });
    try {
      await Promise.all(
        [a, b].map((ctx, index) =>
          login.login(
            index === 0 ? 'switch-b@example.test' : 'switch-a@example.test',
            'password',
            {
              request: ctx.request,
              contextId: ctx.id,
              intentId: reserved[index].intentId,
            },
          ),
        ),
      );
      expect(histories).toHaveLength(2); // No deadlock retry is needed.
      expect(histories).toEqual([[...users].sort(), [...users].sort()]);
    } finally {
      release();
      spy.mockRestore();
      verify.mockRestore();
      rehash.mockRestore();
    }
  });

  it('runs mixed writers concurrently without deadlock', async () => {
    const ctx = await context();
    const users = [
      await user('lock-a@example.test'),
      await user('lock-b@example.test'),
    ];
    let revision = 0;
    const issue = (userId: string) =>
      transaction(fixture.db, async (manager) => {
        const locked = await contexts.bind(manager, ctx.request, ctx.id);
        return sessions.issue(manager, userId, { context: locked });
      });
    const reserve = async () => {
      try {
        await intents.reserve(ctx.request, ctx.id, {
          kind: 'LOCAL_LOGIN',
          expectedRevision: revision,
        });
        revision += 1;
      } catch (error) {
        // Losing a CAS race is expected; only lock errors would fail the test.
        if (
          (error as { problemCode?: string }).problemCode !== 'STALE_REVISION'
        )
          throw error;
      }
    };
    const revokeAll = (userId: string) =>
      transaction(fixture.db, (manager) =>
        sessions.revokeAll(manager, userId, 'LOGOUT_ALL'),
      );
    const work: Promise<unknown>[] = [];
    for (let round = 0; round < 6; round++) {
      work.push(issue(users[round % 2]));
      work.push(reserve());
      work.push(revokeAll(users[(round + 1) % 2]));
      work.push(context());
    }
    const results = await Promise.allSettled(work);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(
      failures.map((failure) => String((failure.reason as Error).message)),
    ).toEqual([]);
  });
  it('merges and joins shared groups concurrently with issue, reserve and revocation under L0-first/L-infinity-last locks', async () => {
    const a = await context();
    const b = await context();
    const combined = {
      headers: {
        cookie: `${a.request.headers.cookie}; ${b.request.headers.cookie}`,
        'x-auth-context': a.id,
      },
      ip: '127.0.0.1',
    };
    const combinedB = {
      ...combined,
      headers: { ...combined.headers, 'x-auth-context': b.id },
    };
    const userId = await user('group-lock@example.test');
    const histories: string[][] = [];
    const original = fixture.db.createQueryRunner.bind(fixture.db);
    const spy = vi
      .spyOn(fixture.db, 'createQueryRunner')
      .mockImplementation((mode) => {
        const runner = original(mode);
        const history: string[] = [];
        histories.push(history);
        const query = runner.query.bind(runner);
        runner.query = ((sql: string, ...args: unknown[]) => {
          if (/FOR UPDATE|pg_advisory_xact_lock/i.test(sql)) {
            history.push(
              /auth_contexts/i.test(sql)
                ? 'L0'
                : /auth_cookie_names|pg_advisory_xact_lock/i.test(sql)
                  ? 'L∞'
                  : 'business',
            );
          }
          return query(sql, ...(args as [unknown[]]));
        }) as typeof runner.query;
        return runner;
      });
    try {
      const results = await Promise.allSettled([
        transaction(fixture.db, async (manager) => {
          const bound = await contexts.bind(manager, combined, a.id);
          await contexts.settle(manager, bound);
        }),
        contexts.provision(combined),
        intents.reserve(combinedB, b.id, {
          kind: 'LOCAL_LOGIN',
          expectedRevision: 0,
        }),
        transaction(fixture.db, async (manager) => {
          const bound = await contexts.bind(manager, combined, a.id);
          const issued = await sessions.issue(manager, userId, {
            context: bound,
          });
          await contexts.settle(manager, bound, [
            {
              name: browser.slotCookieName(issued.slotTag!),
              kind: 'SLOT',
              ownerSessionId: issued.sessionId,
              value: issued.refreshToken,
            },
          ]);
        }),
        transaction(fixture.db, (manager) =>
          sessions.revokeAll(manager, userId, 'LOGOUT_ALL'),
        ),
      ]);
      expect(results.every((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      for (const locks of histories) {
        if (locks.includes('L0')) expect(locks[0]).toBe('L0');
        const last = locks.indexOf('L∞');
        if (last >= 0)
          expect(locks.slice(last).every((lock) => lock === 'L∞')).toBe(true);
      }
      const groups = await fixture.db.query<{ group_id: string }[]>(
        'SELECT DISTINCT group_id FROM auth_contexts',
      );
      expect(groups).toHaveLength(1);
      const ledgerGroups = await fixture.db.query<{ group_id: string }[]>(
        'SELECT DISTINCT group_id FROM auth_cookie_names',
      );
      expect(ledgerGroups).toEqual(groups);
      const [{ count }] = await fixture.db.query<{ count: string }[]>(
        'SELECT count(*)::text AS count FROM auth_cookie_names WHERE observed_present OR unresolved_set',
      );
      expect(Number(count)).toBeLessThanOrEqual(
        fixture.config.authContext.capNames,
      );
    } finally {
      spy.mockRestore();
    }
  });
  it('restarts a stale group snapshot before business locks after a competing merge and join', async () => {
    const a = await context();
    const b = await context();
    const combined = {
      headers: {
        cookie: `${a.request.headers.cookie}; ${b.request.headers.cookie}`,
        'x-auth-context': a.id,
      },
      ip: '127.0.0.1',
    };
    const userId = await user('snapshot-lock@example.test');
    let resume!: () => void;
    let discovered!: () => void;
    const barrier = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const snapshot = new Promise<void>((resolve) => {
      discovered = resolve;
    });
    let pause = true;
    let restarts = 0;
    const histories: string[][] = [];
    const original = fixture.db.createQueryRunner.bind(fixture.db);
    const spy = vi
      .spyOn(fixture.db, 'createQueryRunner')
      .mockImplementation((mode) => {
        const runner = original(mode);
        const query = runner.query.bind(runner);
        const locked = new Set<string>();
        const history: string[] = [];
        histories.push(history);
        runner.query = (async (sql: string, ...args: unknown[]) => {
          if (sql === 'ROLLBACK') restarts += 1;
          if (/FOR UPDATE|pg_advisory_xact_lock/i.test(sql))
            history.push(
              /auth_contexts/.test(sql)
                ? 'L0'
                : /auth_cookie_names|pg_advisory_xact_lock/.test(sql)
                  ? 'L∞'
                  : 'business',
            );
          const result: unknown = await query(sql, ...(args as [unknown[]]));
          if (/SELECT id FROM auth_contexts.*FOR UPDATE/.test(sql))
            for (const row of result as { id: string }[]) locked.add(row.id);
          if (
            sql ===
              'SELECT id FROM auth_contexts WHERE group_id = ANY($1::uuid[])' &&
            pause
          ) {
            pause = false;
            discovered();
            await barrier;
          }
          return result;
        }) as typeof runner.query;
        // Expose only lock IDs to this test's callback, never credentials.
        Object.assign(runner, { contextLocksForTest: locked });
        return runner;
      });
    try {
      const pending = transaction(fixture.db, async (manager) => {
        const bound = await contexts.bind(manager, a.request, a.id);
        const members = await manager.query<{ id: string }[]>(
          'SELECT id FROM auth_contexts WHERE group_id=$1',
          [bound.groupId],
        );
        const locked = (
          manager.queryRunner as unknown as { contextLocksForTest: Set<string> }
        ).contextLocksForTest;
        // Fail before any business/cleanup UPDATE could take an implicit missing L0 lock.
        expect(members.every((row) => locked.has(row.id))).toBe(true);
        const issued = await sessions.issue(manager, userId, {
          context: bound,
        });
        await contexts.settle(manager, bound, [
          {
            name: browser.slotCookieName(issued.slotTag!),
            kind: 'SLOT',
            ownerSessionId: issued.sessionId,
            value: issued.refreshToken,
          },
        ]);
      });
      const result = pending.catch((error: unknown) => error);
      await snapshot;
      const joined = await contexts.provision(combined);
      resume();
      expect(await result).toBeUndefined();
      expect(restarts).toBeGreaterThanOrEqual(1);
      for (const locks of histories) {
        if (locks.includes('L0')) expect(locks[0]).toBe('L0');
        const ledger = locks.indexOf('L∞');
        if (ledger >= 0)
          expect(locks.slice(ledger).every((lock) => lock === 'L∞')).toBe(true);
      }
      const groups = await fixture.db.query<{ group_id: string }[]>(
        'SELECT DISTINCT group_id FROM auth_contexts',
      );
      expect(groups).toHaveLength(1);
      expect(
        await fixture.db.query('SELECT id FROM auth_contexts WHERE id=$1', [
          joined.contextId,
        ]),
      ).toHaveLength(1);
      expect(
        await fixture.db.query(
          'SELECT DISTINCT group_id FROM auth_cookie_names',
        ),
      ).toEqual(groups);
      const [{ count }] = await fixture.db.query<{ count: string }[]>(
        'SELECT count(*)::text AS count FROM auth_cookie_names WHERE observed_present OR unresolved_set',
      );
      expect(Number(count)).toBeLessThanOrEqual(
        fixture.config.authContext.capNames,
      );
    } finally {
      resume();
      spy.mockRestore();
    }
  });
});
