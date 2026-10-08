import { OAuthTransactionService } from '../../../src/modules/identity-access/oauth/oauth-transaction.service';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { AuthContextService } from '../../../src/modules/identity-access/context/auth-context.service';
import { AuthIntentService } from '../../../src/modules/identity-access/context/auth-intent.service';
import { CookieLedgerService } from '../../../src/modules/identity-access/context/cookie-ledger.service';
import { registrationFixture } from '../../registration-fixture';

type Jar = Map<string, string>;
const header = (jar: Jar) =>
  [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
const req = (jar: Jar, contextId?: string) => ({
  headers: {
    cookie: header(jar),
    ...(contextId ? { 'x-auth-context': contextId } : {}),
  },
  ip: '127.0.0.1',
});

/** 006 T009: intent CAS (P01-b), groups and value-exact capacity ledger. */
describe.sequential('auth context services', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let browser: BrowserSecurityService;
  let ledger: CookieLedgerService;
  let contexts: AuthContextService;
  let intents: AuthIntentService;

  beforeAll(async () => {
    fixture = await registrationFixture();
    browser = new BrowserSecurityService(fixture.config);
    ledger = new CookieLedgerService(fixture.config, fixture.crypto);
    contexts = new AuthContextService(
      fixture.db,
      fixture.config,
      fixture.crypto,
      browser,
      ledger,
    );
    intents = new AuthIntentService(fixture.db, fixture.config, contexts);
  });
  beforeEach(async () => {
    await fixture.clear();
    await fixture.db.query(
      'TRUNCATE auth_cookie_names, auth_intents, auth_contexts CASCADE',
    );
  });
  afterAll(async () => fixture?.close());

  /** Provision + install + confirm, like a browser that receives every response. */
  async function activeContext(jar: Jar = new Map()) {
    const provisioned = await contexts.provision(req(jar));
    jar.set(
      browser.bindingCookieName(provisioned.contextId),
      provisioned.secret,
    );
    await contexts.confirm(
      req(jar, provisioned.contextId),
      provisioned.contextId,
    );
    return { jar, contextId: provisioned.contextId };
  }

  const groupOf = async (contextId: string) =>
    (
      await fixture.db.query<{ group_id: string }[]>(
        'SELECT group_id FROM auth_contexts WHERE id=$1',
        [contextId],
      )
    )[0].group_id;

  it('P01-b: a stale reservation never supersedes a newer accepted intent', async () => {
    const { jar, contextId } = await activeContext();
    const a = await intents.reserve(req(jar, contextId), contextId, {
      kind: 'LOCAL_LOGIN',
      expectedRevision: 0,
    });
    expect(a.revision).toBe(1);
    const b = await intents.reserve(req(jar, contextId), contextId, {
      kind: 'OAUTH',
      expectedRevision: 1,
    });
    expect(b.revision).toBe(2);
    // Late A request still carrying its old expected revision.
    await expect(
      intents.reserve(req(jar, contextId), contextId, {
        kind: 'LOCAL_LOGIN',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({
      problemCode: 'STALE_REVISION',
      currentRevision: 2,
    });
    const rows = await fixture.db.query<{ id: string; state: string }[]>(
      'SELECT id,state FROM auth_intents ORDER BY revision',
    );
    expect(rows).toEqual([
      { id: a.intentId, state: 'SUPERSEDED' },
      { id: b.intentId, state: 'RESERVED' },
    ]);
    await fixture.db.transaction(async (manager) => {
      const context = await contexts.bind(
        manager,
        req(jar, contextId),
        contextId,
      );
      await expect(
        intents.assertCurrent(manager, context, a.intentId),
      ).rejects.toMatchObject({ problemCode: 'SUPERSEDED' });
      await expect(
        intents.assertCurrent(manager, context, b.intentId),
      ).resolves.toMatchObject({ id: b.intentId });
    });
  });

  it('expired intents cannot execute', async () => {
    const { jar, contextId } = await activeContext();
    const intent = await intents.reserve(req(jar, contextId), contextId, {
      kind: 'LOCAL_LOGIN',
      expectedRevision: 0,
    });
    await fixture.db.query(
      "UPDATE auth_intents SET expires_at=created_at + interval '1 millisecond' WHERE id=$1",
      [intent.intentId],
    );
    await fixture.db.transaction(async (manager) => {
      const context = await contexts.bind(
        manager,
        req(jar, contextId),
        contextId,
      );
      await expect(
        intents.assertCurrent(manager, context, intent.intentId),
      ).rejects.toMatchObject({ problemCode: 'SUPERSEDED' });
    });
  });

  it('provisioning with a co-present binding joins its group (IDB-only reset cannot bypass)', async () => {
    const { jar, contextId } = await activeContext();
    const second = await contexts.provision(req(jar));
    expect(await groupOf(second.contextId)).toBe(await groupOf(contextId));
  });

  it('a fresh jar starts a new group; co-presenting two groups merges them', async () => {
    const one = await activeContext();
    const two = await activeContext();
    expect(await groupOf(one.contextId)).not.toBe(await groupOf(two.contextId));
    const merged: Jar = new Map([...one.jar, ...two.jar]);
    await contexts.provision(req(merged));
    expect(await groupOf(one.contextId)).toBe(await groupOf(two.contextId));
    const names = await fixture.db.query<{ group_id: string }[]>(
      'SELECT DISTINCT group_id FROM auth_cookie_names',
    );
    expect(names).toHaveLength(1);
  });

  it('acknowledges only the exact emitted value and releases only after absence', async () => {
    const provisioned = await contexts.provision(req(new Map()));
    const name = browser.bindingCookieName(provisioned.contextId);
    const group = await groupOf(provisioned.contextId);
    const row = async () =>
      (
        await fixture.db.query<
          { unresolved_set: boolean; observed_present: boolean }[]
        >(
          'SELECT unresolved_set,observed_present FROM auth_cookie_names WHERE group_id=$1 AND name=$2',
          [group, name],
        )
      )[0];
    expect(await row()).toMatchObject({ unresolved_set: true });
    // A different value under the same name is not an acknowledgement.
    await fixture.db.transaction((manager) =>
      ledger.observe(manager, group, [
        { name, value: 'A'.repeat(43), bytes: 80 },
      ]),
    );
    expect(await row()).toMatchObject({
      unresolved_set: true,
      observed_present: true,
    });
    // Absence while unresolved never releases (no TTL release).
    await fixture.db.transaction((manager) =>
      ledger.observe(manager, group, []),
    );
    expect(await row()).toMatchObject({
      unresolved_set: true,
      observed_present: false,
    });
    // Exact value acknowledges; later absence releases the name.
    await fixture.db.transaction((manager) =>
      ledger.observe(manager, group, [
        { name, value: provisioned.secret, bytes: 80 },
      ]),
    );
    expect(await row()).toMatchObject({
      unresolved_set: false,
      observed_present: true,
    });
    await fixture.db.transaction((manager) =>
      ledger.observe(manager, group, []),
    );
    expect(await row()).toBeUndefined();
  });

  it('counts unresolved and observed names toward CAP_NAMES', async () => {
    const { jar, contextId } = await activeContext();
    const group = await groupOf(contextId);
    await fixture.db.transaction(async (manager) => {
      for (let i = 0; i < fixture.config.authContext.capNames - 1; i++)
        await ledger.recordSet(manager, group, {
          name: browser.slotCookieName(String(i).padStart(22, 'Q')),
          kind: 'SLOT',
          ownerSessionId: '00000000-0000-4000-8000-00000000000' + (i % 10),
          value: `v${i}`,
        });
    });
    await expect(contexts.provision(req(jar))).rejects.toMatchObject({
      problemCode: 'CAPACITY_EXHAUSTED',
    });
    const [{ count }] = await fixture.db.query<{ count: string }[]>(
      'SELECT count(*)::text AS count FROM auth_contexts',
    );
    expect(count).toBe('1');
  });

  it('records an unknown late slot owner as null instead of a sentinel UUID', async () => {
    const { contextId } = await activeContext();
    const group = await groupOf(contextId);
    const name = browser.slotCookieName('ZZZZZZZZZZZZZZZZZZZZZZ');
    await fixture.db.transaction((manager) =>
      ledger.observe(manager, group, [
        { name, value: 'A'.repeat(43), bytes: 80 },
      ]),
    );
    const [row] = await fixture.db.query<
      { owner_session_id: string | null; observed_present: boolean }[]
    >(
      'SELECT owner_session_id,observed_present FROM auth_cookie_names WHERE name=$1',
      [name],
    );
    expect(row).toEqual({ owner_session_id: null, observed_present: true });
  });

  it('binding verification fails closed for wrong, duplicate or retired bindings', async () => {
    const { jar, contextId } = await activeContext();
    const name = browser.bindingCookieName(contextId);
    const wrong: Jar = new Map([[name, 'B'.repeat(43)]]);
    await expect(
      fixture.db.transaction((manager) =>
        contexts.bind(manager, req(wrong, contextId), contextId),
      ),
    ).rejects.toMatchObject({ problemCode: 'BINDING_INVALID' });
    await fixture.db.query(
      "UPDATE auth_contexts SET state='RETIRED',retired_at=now() WHERE id=$1",
      [contextId],
    );
    await expect(
      fixture.db.transaction((manager) =>
        contexts.bind(manager, req(jar, contextId), contextId),
      ),
    ).rejects.toMatchObject({ problemCode: 'CONTEXT_UNAVAILABLE' });
  });
  it('cleans only older empty bindings, retires their authority and preserves the newest binding', async () => {
    const old = await activeContext();
    const newer = await activeContext(old.jar);
    const cleaned = await fixture.db.transaction(async (manager) => {
      const bound = await contexts.bind(
        manager,
        req(newer.jar, newer.contextId),
        newer.contextId,
      );
      return contexts.settle(manager, bound);
    });
    expect(cleaned).not.toContain(browser.bindingCookieName(newer.contextId));
    const [oldRow] = await fixture.db.query<{ state: string }[]>(
      'SELECT state FROM auth_contexts WHERE id=$1',
      [old.contextId],
    );
    expect(oldRow.state).toBe('RETIRED');
    // A cleanup decision cannot leave an older empty context able to issue a new session.
    await expect(
      intents.reserve(req(old.jar, old.contextId), old.contextId, {
        kind: 'LOCAL_LOGIN',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ problemCode: 'CONTEXT_UNAVAILABLE' });
  });

  it('cleanup does not acknowledge a held obsolete slot; exact presentation then absence reclaims capacity', async () => {
    const current = await activeContext();
    const group = await groupOf(current.contextId);
    const [{ id: userId }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at) VALUES (gen_random_uuid(),'cleanup@example.test','hash','LOCAL','CUSTOMER','ACTIVE',now(),now(),now()) RETURNING id`,
    );
    const [{ id: sessionId }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO auth_sessions (id,user_id,csrf_seed,csrf_key_version,created_at,absolute_expires_at,context_id,slot_tag,revoked_at,revocation_reason) VALUES (gen_random_uuid(),$1,$2,1,now(),now()+interval '14 days',$3,$4,now(),'SUPERSEDED') RETURNING id`,
      [userId, Buffer.alloc(32), current.contextId, 'CCCCCCCCCCCCCCCCCCCCCC'],
    );
    const name = browser.slotCookieName('CCCCCCCCCCCCCCCCCCCCCC');
    const value = 'L'.repeat(43);
    await fixture.db.transaction((manager) =>
      ledger.recordSet(manager, group, {
        name,
        kind: 'SLOT',
        ownerSessionId: sessionId,
        value,
      }),
    );
    const settle = () =>
      fixture.db.transaction(async (manager) => {
        const bound = await contexts.bind(
          manager,
          req(current.jar, current.contextId),
          current.contextId,
        );
        return contexts.settle(manager, bound);
      });
    expect(await settle()).toContain(name);
    expect(
      (
        await fixture.db.query<{ unresolved_set: boolean }[]>(
          'SELECT unresolved_set FROM auth_cookie_names WHERE name=$1',
          [name],
        )
      )[0].unresolved_set,
    ).toBe(true);
    expect(
      (await fixture.db.transaction((manager) => ledger.usage(manager, group)))
        .names,
    ).toBe(2);
    // Old headers arrive after the clear; they must still count against the budget.
    current.jar.set(name, value);
    expect(await settle()).toContain(name);
    current.jar.delete(name);
    await settle();
    expect(
      (await fixture.db.transaction((manager) => ledger.usage(manager, group)))
        .names,
    ).toBe(1);
  });

  for (const state of ['RESERVED', 'EXPIRED'] as const) {
    it(`read-only ${state} outcome preserves co-present groups and unresolved capacity`, async () => {
      const pair = [await activeContext(), await activeContext()];
      const entries = await Promise.all(
        pair.map(async (value) => ({
          ...value,
          group: await groupOf(value.contextId),
        })),
      );
      entries.sort((a, b) => a.group.localeCompare(b.group));
      const [survivor, losing] = entries;
      const reserved = await intents.reserve(
        req(survivor.jar, survivor.contextId),
        survivor.contextId,
        { kind: 'LOCAL_LOGIN', expectedRevision: 0 },
      );
      await fixture.db.transaction(async (manager) => {
        for (let i = 0; i < fixture.config.authContext.capNames - 1; i++)
          await ledger.recordSet(manager, losing.group, {
            name: browser.slotCookieName(String(i).padStart(22, 'Q')),
            kind: 'SLOT',
            ownerSessionId: '00000000-0000-4000-8000-00000000000' + i,
            value: `v${i}`,
          });
      });
      if (state === 'EXPIRED')
        await fixture.db.query(
          "UPDATE auth_intents SET created_at=now()-interval '2 seconds', expires_at=now()-interval '1 second' WHERE id=$1",
          [reserved.intentId],
        );
      await fixture.db.query(
        "UPDATE auth_contexts SET last_seen_at=now()-interval '2 minutes'",
      );
      const snapshot = async () => ({
        contexts: await fixture.db.query<unknown[]>(
          'SELECT id,group_id,last_seen_at,revision,current_intent_id,current_session_id FROM auth_contexts ORDER BY id',
        ),
        ledger: await fixture.db.query<unknown[]>(
          "SELECT md5(string_agg(row_to_json(n)::text, '' ORDER BY group_id,name)) AS fingerprint FROM auth_cookie_names n",
        ),
        intents: await fixture.db.query<unknown[]>(
          'SELECT id,state,resolved_at,expires_at FROM auth_intents ORDER BY id',
        ),
      });
      const before = await snapshot();
      const jar: Jar = new Map([...survivor.jar, ...losing.jar]);
      const result = await intents.outcome(
        req(jar, survivor.contextId),
        survivor.contextId,
        reserved.intentId,
      );
      expect(result.state).toBe(state);
      expect(await snapshot()).toEqual(before);
      await expect(contexts.provision(req(jar))).rejects.toMatchObject({
        problemCode: 'CAPACITY_EXHAUSTED',
      });
      expect(await snapshot()).toEqual(before);
    });
  }

  it('OAuth start settles co-present group ledgers after business writes without losing unresolved names', async () => {
    const pair = [await activeContext(), await activeContext()];
    const entries = await Promise.all(
      pair.map(async (value) => ({
        ...value,
        group: await groupOf(value.contextId),
      })),
    );
    entries.sort((a, b) => a.group.localeCompare(b.group));
    const [survivor, losing] = entries;
    const reserved = await intents.reserve(
      req(survivor.jar, survivor.contextId),
      survivor.contextId,
      { kind: 'OAUTH', expectedRevision: 0 },
    );
    await fixture.db.transaction(async (manager) => {
      for (let i = 0; i < fixture.config.authContext.capNames - 1; i++)
        await ledger.recordSet(manager, losing.group, {
          name: browser.slotCookieName(String(i).padStart(22, 'Q')),
          kind: 'SLOT',
          ownerSessionId: '00000000-0000-4000-8000-00000000000' + i,
          value: `v${i}`,
        });
    });
    const oauth = new OAuthTransactionService(
      fixture.db,
      fixture.config,
      fixture.crypto,
      contexts,
      intents,
    );
    const jar: Jar = new Map([...survivor.jar, ...losing.jar]);
    const trace: string[] = [];
    const runner = fixture.db.createQueryRunner.bind(fixture.db);
    fixture.db.createQueryRunner = (...args) => {
      const queryRunner = runner(...args);
      const query = queryRunner.query.bind(queryRunner);
      queryRunner.query = (async (
        ...queryArgs: Parameters<typeof queryRunner.query>
      ) => {
        trace.push(String(queryArgs[0]));
        const result: unknown = await query(...queryArgs);
        return result;
      }) as typeof queryRunner.query;
      return queryRunner;
    };
    try {
      await oauth.start(
        'GOOGLE',
        'OAUTH_RESULT',
        req(jar, survivor.contextId),
        reserved.intentId,
      );
    } finally {
      fixture.db.createQueryRunner = runner;
    }
    expect(await groupOf(survivor.contextId)).toBe(
      await groupOf(losing.contextId),
    );
    expect(
      await fixture.db.query('SELECT DISTINCT group_id FROM auth_cookie_names'),
    ).toHaveLength(1);
    const [unresolved] = await fixture.db.query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM auth_cookie_names WHERE unresolved_set',
    );
    expect(unresolved.count).toBe(fixture.config.authContext.capNames - 1);
    const business = trace.findIndex((sql) =>
      /INSERT INTO oauth_transactions/.test(sql),
    );
    const ledgerWrite = trace.findIndex((sql) =>
      /INSERT INTO auth_cookie_names/.test(sql),
    );
    expect(business).toBeGreaterThanOrEqual(0);
    expect(ledgerWrite).toBeGreaterThan(business);
    await expect(contexts.provision(req(jar))).rejects.toMatchObject({
      problemCode: 'CAPACITY_EXHAUSTED',
    });
  });
});
