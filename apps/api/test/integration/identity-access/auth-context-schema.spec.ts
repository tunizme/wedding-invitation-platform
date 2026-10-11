import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';

/** 006 T007: schema for auth contexts, intents, cookie ledger and session columns. */
describe.sequential('006 auth context schema', () => {
  let db: DataSource;

  beforeAll(async () => {
    if (!process.env.IAM_TEST_SCHEMA)
      throw new Error('Run inside a disposable IAM test schema');
    db = new DataSource(databaseOptions());
    await db.initialize();
    await db.runMigrations();
  });
  afterAll(async () => db?.destroy());

  const columns = async (table: string) =>
    (
      await db.query<{ column_name: string; is_nullable: string }[]>(
        `SELECT column_name,is_nullable FROM information_schema.columns
         WHERE table_schema=current_schema() AND table_name=$1`,
        [table],
      )
    ).reduce<Record<string, string>>(
      (all, row) => ({ ...all, [row.column_name]: row.is_nullable }),
      {},
    );

  it('creates auth_contexts, auth_intents and auth_cookie_names', async () => {
    const contexts = await columns('auth_contexts');
    for (const column of [
      'id',
      'binding_digest',
      'binding_key_version',
      'group_id',
      'state',
      'confirmed_seq',
      'revision',
      'current_intent_id',
      'current_session_id',
      'created_at',
      'confirmed_at',
      'last_seen_at',
      'retired_at',
    ])
      expect(contexts).toHaveProperty(column);
    const intents = await columns('auth_intents');
    for (const column of [
      'id',
      'context_id',
      'kind',
      'revision',
      'state',
      'outcome_code',
      'target_session_id',
      'oauth_started_at',
      'expires_at',
      'created_at',
      'resolved_at',
    ])
      expect(intents).toHaveProperty(column);
    const ledger = await columns('auth_cookie_names');
    for (const column of [
      'group_id',
      'name',
      'kind',
      'owner_context_id',
      'owner_session_id',
      'last_set_digest',
      'unresolved_set',
      'observed_present',
      'observed_at',
      'bytes',
    ])
      expect(ledger).toHaveProperty(column);
  });

  it('adds nullable context/intent columns to existing IAM tables', async () => {
    expect((await columns('auth_sessions')).context_id).toBe('YES');
    expect((await columns('auth_sessions')).slot_tag).toBe('YES');
    expect((await columns('oauth_transactions')).intent_id).toBe('YES');
    expect((await columns('pending_social_onboardings')).context_id).toBe(
      'YES',
    );
  });

  it('enforces state/kind enums, unique slot tags and SUPERSEDED revocation', async () => {
    const userId = randomUUID();
    const now = new Date();
    await db.query(
      `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES ($1,$2,'hash','LOCAL','CUSTOMER','ACTIVE',$3,$3,$3)`,
      [userId, `${userId}@example.test`, now],
    );
    const contextId = randomUUID();
    await db.query(
      `INSERT INTO auth_contexts (id,binding_digest,binding_key_version,group_id,state,revision,created_at)
       VALUES ($1,$2,1,$3,'PROVISIONAL',0,$4)`,
      [contextId, Buffer.alloc(32, 1), randomUUID(), now],
    );
    await expect(
      db.query(
        `INSERT INTO auth_contexts (id,binding_digest,binding_key_version,group_id,state,revision,created_at)
         VALUES ($1,$2,1,$3,'BOGUS',0,$4)`,
        [randomUUID(), Buffer.alloc(32, 2), randomUUID(), now],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `INSERT INTO auth_intents (id,context_id,kind,revision,state,expires_at,created_at)
         VALUES ($1,$2,'BOGUS',1,'RESERVED',$3,$3)`,
        [randomUUID(), contextId, now],
      ),
    ).rejects.toThrow();
    const insertSession = (tag: string) =>
      db.query(
        `INSERT INTO auth_sessions (id,user_id,csrf_seed,csrf_key_version,created_at,absolute_expires_at,context_id,slot_tag)
         VALUES ($1,$2,$3,1,$4::timestamptz,$4::timestamptz + interval '336 hours',$5,$6)`,
        [randomUUID(), userId, Buffer.alloc(32), now, contextId, tag],
      );
    await insertSession('A'.repeat(22));
    await expect(insertSession('A'.repeat(22))).rejects.toThrow();
    await db.query(
      `UPDATE auth_sessions SET revoked_at=now(),revocation_reason='SUPERSEDED' WHERE slot_tag=$1`,
      ['A'.repeat(22)],
    );
    await expect(
      db.query(
        `INSERT INTO auth_intents (id,context_id,kind,revision,state,expires_at,created_at)
         VALUES ($1,$2,'LOCAL_LOGIN',1,'RESERVED',$3,$3)`,
        [randomUUID(), randomUUID(), now],
      ),
    ).rejects.toThrow();
  });

  it('keeps synchronize disabled and has no pending migrations', async () => {
    expect(db.options.synchronize).toBe(false);
    expect(await db.runMigrations()).toHaveLength(0);
  });

  it('reverts and re-applies the 006 migration only inside a test schema', async () => {
    const applied = await db.query<{ name: string }[]>(
      'SELECT name FROM foundation_migrations ORDER BY id DESC',
    );
    const count =
      applied.findIndex(
        (row) => row.name === 'AuthTransitionContexts20261007000100',
      ) + 1;
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index++) await db.undoLastMigration();
    const tables = (
      await db.query<{ tablename: string }[]>(
        'SELECT tablename FROM pg_tables WHERE schemaname=current_schema()',
      )
    ).map((row) => row.tablename);
    expect(tables).not.toContain('auth_contexts');
    expect((await columns('auth_sessions')).context_id).toBeUndefined();
    expect(await db.runMigrations()).toHaveLength(count);
    expect(await columns('auth_contexts')).toHaveProperty('revision');
  });
});
