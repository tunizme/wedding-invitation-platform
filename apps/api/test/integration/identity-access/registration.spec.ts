import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { registrationFixture } from '../../registration-fixture';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';

describe.sequential('local registration and durable email outbox', () => {
  let f: Awaited<ReturnType<typeof registrationFixture>>;
  beforeAll(async () => {
    f = await registrationFixture();
  });
  beforeEach(async () => f.clear());
  afterAll(async () => {
    if (f) await f.close();
  });
  const worker = (
    send: () => Promise<string> = () => Promise.resolve('accepted'),
  ) => new EmailOutboxWorker(f.db, f.crypto, { send }, f.config.frontendOrigin);
  it('concurrent normalized duplicates produce one account without overwriting password or stripping dots/+tag', async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        f.register.register(' A.B+Tag@example.test ', '  Original 🔒  '),
      ),
    );
    await f.register.register('a.b+tag@example.test', 'replacement password');
    const rows = await f.db.query<
      {
        id: string;
        email: string;
        password_hash: string;
        role: string;
        status: string;
        login_method: string;
        email_verified_at: Date | null;
      }[]
    >('SELECT * FROM users');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: 'a.b+tag@example.test',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      login_method: 'LOCAL',
      email_verified_at: null,
    });
    expect(
      await f.crypto.verifyPassword(rows[0].password_hash, '  Original 🔒  '),
    ).toBe(true);
    expect(
      await f.crypto.verifyPassword(
        rows[0].password_hash,
        'replacement password',
      ),
    ).toBe(false);
    expect(
      (
        await f.db.query<{ count: string }[]>(
          'SELECT count(*) FROM auth_sessions',
        )
      )[0].count,
    ).toBe('0');
    expect(
      (
        await f.db.query<{ count: string }[]>(
          'SELECT count(*) FROM email_outbox',
        )
      )[0].count,
    ).toBe('1');
  });
  it('rolls back user creation if outbox insert fails', async () => {
    await f.db.query(
      "ALTER TABLE email_outbox ADD CONSTRAINT test_reject CHECK (recipient_email <> 'rollback@example.test')",
    );
    try {
      await expect(
        f.register.register('rollback@example.test', 'long password'),
      ).rejects.toThrow();
      expect(await f.db.query('SELECT id FROM users')).toHaveLength(0);
    } finally {
      await f.db.query('ALTER TABLE email_outbox DROP CONSTRAINT test_reject');
    }
  });
  it('delivers outside transactions, activates proof only after acceptance and clears ciphertext', async () => {
    await f.register.register('a@example.test', 'long password');
    const w = worker(async () => {
      await f.db.transaction(async (manager) => {
        await manager.query('SELECT id FROM users FOR UPDATE NOWAIT');
        await manager.query('SELECT id FROM auth_challenges FOR UPDATE NOWAIT');
        await manager.query('SELECT id FROM email_outbox FOR UPDATE NOWAIT');
      });
      const [{ status }] = await f.db.query<{ status: string }[]>(
        'SELECT status FROM auth_challenges',
      );
      expect(status).toBe('PENDING_DELIVERY');
      return 'accepted';
    });
    await w.runOnce();
    expect(
      (
        await f.db.query<{ status: string }[]>(
          'SELECT status FROM auth_challenges',
        )
      )[0].status,
    ).toBe('ACTIVE');
    expect(
      (
        await f.db.query<
          { payload_ciphertext: Buffer | null; status: string }[]
        >('SELECT * FROM email_outbox')
      )[0],
    ).toMatchObject({ payload_ciphertext: null, status: 'DELIVERED' });
  });
  it('reclaims a crashed lease and prevents its old owner from finalizing', async () => {
    await f.register.register('a@example.test', 'long password');
    const w = worker();
    const old = await w.claim();
    expect(old).toBeDefined();
    await f.db.query(
      "UPDATE email_outbox SET lease_expires_at = now()-interval '1 second'",
    );
    const fresh = await w.claim();
    expect(fresh!.lease_owner).not.toBe(old!.lease_owner);
    expect(await w.finalize(old!, { accepted: true, messageId: 'old' })).toBe(
      false,
    );
    expect(await w.finalize(fresh!, { accepted: true, messageId: 'new' })).toBe(
      true,
    );
  });
  it('retries acceptance-before-finalize crashes with the same idempotency key and proof', async () => {
    await f.register.register('a@example.test', 'long password');
    const send = vi.fn().mockResolvedValue('accepted');
    const w = new EmailOutboxWorker(
      f.db,
      f.crypto,
      { send },
      f.config.frontendOrigin,
    );
    const finalize = vi
      .spyOn(w, 'finalize')
      .mockRejectedValueOnce(new Error('crash'));
    await expect(w.runOnce()).rejects.toThrow('crash');
    expect(
      (
        await f.db.query<{ status: string }[]>(
          'SELECT status FROM auth_challenges',
        )
      )[0].status,
    ).toBe('PENDING_DELIVERY');
    await f.db.query(
      "UPDATE email_outbox SET lease_expires_at=now()-interval '1 second'",
    );
    await w.runOnce();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(
      (
        await f.db.query<{ status: string }[]>(
          'SELECT status FROM auth_challenges',
        )
      )[0].status,
    ).toBe('ACTIVE');
    finalize.mockRestore();
  });
  it('never lets stale delivery revoke a newer active generation', async () => {
    await f.register.register('a@example.test', 'long password');
    const w = worker(),
      old = await w.claim();
    const [{ id }] = await f.db.query<{ id: string }[]>('SELECT id FROM users');
    await f.db.transaction((m) =>
      f.challenges.enqueueLocalVerification(m, id, 'a@example.test'),
    );
    const fresh = await w.claim();
    await w.finalize(fresh!, { accepted: true, messageId: 'new' });
    await w.finalize(old!, { accepted: true, messageId: 'old' });
    const rows = await f.db.query<{ status: string; generation: string }[]>(
      'SELECT status,generation FROM auth_challenges ORDER BY generation',
    );
    expect(rows).toEqual([
      { status: 'REVOKED', generation: '0' },
      { status: 'ACTIVE', generation: '1' },
    ]);
  });
  it('bounds failed sends to five attempts, preserves payload during retries and clears it on terminal failure', async () => {
    await f.register.register('a@example.test', 'long password');
    const send = vi
      .fn()
      .mockRejectedValue(new Error('provider secret must not persist'));
    const w = new EmailOutboxWorker(
      f.db,
      f.crypto,
      { send },
      f.config.frontendOrigin,
    );
    for (let attempt = 1; attempt <= 5; attempt++) {
      await w.runOnce();
      const [row] = await f.db.query<
        {
          status: string;
          payload_ciphertext: Buffer | null;
          last_error_code: string;
        }[]
      >('SELECT status,payload_ciphertext,last_error_code FROM email_outbox');
      expect(row.status).toBe(
        attempt === 5 ? 'TERMINAL_FAILURE' : 'RETRYABLE_FAILURE',
      );
      expect(row.payload_ciphertext === null).toBe(attempt === 5);
      expect(row.last_error_code).toBe('EMAIL_DELIVERY_FAILED');
      await f.db.query(
        "UPDATE email_outbox SET next_attempt_at=now()-interval '1 second'",
      );
    }
    await w.runOnce();
    expect(send).toHaveBeenCalledTimes(5);
  });
  it('resend failure preserves active proof; delayed success cannot resurrect consumed proof', async () => {
    await f.register.register('a@example.test', 'long password');
    const w = worker();
    await w.runOnce();
    const [{ id }] = await f.db.query<{ id: string }[]>('SELECT id FROM users');
    await f.db.transaction((m) =>
      f.challenges.enqueueLocalVerification(m, id, 'a@example.test'),
    );
    const claimed = await w.claim();
    await w.finalize(claimed!, { accepted: false, terminal: true });
    expect(
      (
        await f.db.query<{ count: string }[]>(
          "SELECT count(*) FROM auth_challenges WHERE status='ACTIVE'",
        )
      )[0].count,
    ).toBe('1');
    await f.db.transaction((m) =>
      f.challenges.enqueueLocalVerification(m, id, 'a@example.test'),
    );
    const delayed = await w.claim();
    await f.db.query(
      "UPDATE auth_challenges SET status='CONSUMED',consumed_at=now() WHERE id=$1",
      [delayed!.challenge_id],
    );
    await w.finalize(delayed!, { accepted: true, messageId: 'late' });
    expect(
      (
        await f.db.query<{ status: string }[]>(
          'SELECT status FROM auth_challenges WHERE id=$1',
          [delayed!.challenge_id],
        )
      )[0].status,
    ).toBe('CONSUMED');
  });
});
