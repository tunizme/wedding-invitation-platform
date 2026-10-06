import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import { RsvpService } from '../../../src/modules/invitation-rsvp/application/rsvp.service';
import { RsvpControlService } from '../../../src/modules/invitation-rsvp/application/rsvp-control.service';
import { RsvpRetentionWorker } from '../../../src/modules/invitation-rsvp/infrastructure/rsvp-retention.worker';
import {
  enforceRsvpRate,
  rsvpSourceHash,
} from '../../../src/modules/invitation-rsvp/application/rsvp-rate-limit';
import { normalizeRsvp } from '../../../src/modules/invitation-rsvp/domain/rsvp-input';
import { canonicalHash } from '../../../src/modules/invitation-builder/domain/validation-helpers';
import { InvitationRsvp20261001000300 } from '../../../src/infrastructure/database/migrations/20261001000300-InvitationRsvp';
import { PublicationService } from '../../../src/modules/invitation-builder/publication/publication.service';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
const payload = {
  name: 'Khách',
  attendance: 'ATTENDING' as const,
  partySize: 1,
  message: 'Lời nhắn',
};
describe.sequential(
  'RSVP PostgreSQL ordering, rate boundary and retention',
  () => {
    let f: Fixture,
      owner: Awaited<ReturnType<Fixture['user']>>,
      admin: typeof owner,
      service: RsvpService,
      control: RsvpControlService;
    beforeAll(async () => {
      f = await builderDatabase();
      owner = await f.user();
      admin = await f.user('ADMIN');
      service = f.app.get(RsvpService);
      control = f.app.get(RsvpControlService);
    });
    afterAll(async () => {
      await f?.close();
    });
    async function published() {
      const t = await f.template(admin.principal),
        r = await f.revision(admin.principal, t.id),
        i = await f.invitation(owner.principal, r.id),
        slug = randomUUID();
      await f.db.query(
        `UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,published_at=clock_timestamp(),
 published_wedding_data=draft_wedding_data,published_scene=$3,published_has_visible_rsvp=true WHERE id=$1`,
        [
          i.id,
          slug,
          {
            schemaVersion: 1,
            rendererContractVersion: 1,
            canvas: { width: 390, height: 520 },
            elements: [],
          },
        ],
      );
      return { id: i.id, slug };
    }
    async function lock(id: string) {
      const runner = f.db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      await runner.query('SELECT id FROM invitations WHERE id=$1 FOR UPDATE', [
        id,
      ]);
      return runner;
    }
    async function blockedOn(id: string) {
      const until = Date.now() + 3000;
      while (Date.now() < until) {
        const rows: { blocked: boolean }[] = await f.db.query(
          `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%invitations%') AS blocked`,
        );
        if (rows[0].blocked) return;
        await new Promise((done) => setTimeout(done, 10));
      }
      throw new Error('RSVP did not contend on the invitation lock ' + id);
    }
    async function finish(runner: QueryRunner) {
      try {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
      } finally {
        await runner.release();
      }
    }
    it('concurrent same-key commits only one receipt, conflicting payload cannot overwrite it', async () => {
      const i = await published(),
        key = randomUUID();
      const [a, b] = await Promise.all([
        service.submit(i.slug, key, payload, '127.0.0.1'),
        service.submit(i.slug, key, payload, '127.0.0.1'),
      ]);
      expect(a.receipt).toEqual(b.receipt);
      expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
      await expect(
        service.submit(
          i.slug,
          key,
          { ...payload, message: 'khác' },
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({ problemCode: 'IDEMPOTENCY_CONFLICT' });
      expect(
        await f.db.query(
          'SELECT count(*)::int AS n FROM rsvp_responses WHERE invitation_id=$1',
          [i.id],
        ),
      ).toEqual([{ n: 1 }]);
    });
    it('acceptance timestamp is measured after acquiring the lock', async () => {
      const i = await published(),
        runner = await lock(i.id);
      let work: Promise<Awaited<ReturnType<RsvpService['submit']>>> | undefined;
      try {
        work = service.submit(i.slug, randomUUID(), payload, '127.0.0.1');
        await blockedOn(i.id);
        const clocks = (await runner.query(
          'SELECT clock_timestamp() AS at',
        )) as { at: Date }[];
        await runner.commitTransaction();
        const result = await work;
        expect(Date.parse(result.receipt.acceptedAt)).toBeGreaterThanOrEqual(
          clocks[0].at.getTime(),
        );
      } finally {
        await finish(runner);
        await work;
      }
    });
    for (const action of ['close', 'unpublish'] as const)
      it(`rejects a waiting new acceptance after ${action} commits, but replays a prior receipt`, async () => {
        const i = await published(),
          key = randomUUID(),
          accepted = await service.submit(i.slug, key, payload, '127.0.0.1'),
          runner = await lock(i.id);
        let outcome: Promise<{ status?: number }> | undefined;
        try {
          outcome = service
            .submit(i.slug, randomUUID(), payload, '127.0.0.1')
            .then(
              () => ({ status: 201 }),
              (error) => ({
                status: (error as { getStatus: () => number }).getStatus(),
              }),
            );
          await blockedOn(i.id);
          if (action === 'close')
            await runner.query(
              'UPDATE invitations SET rsvp_open=false,control_version=control_version+1 WHERE id=$1',
              [i.id],
            );
          else
            await runner.query(
              "UPDATE invitations SET status='UNPUBLISHED',edit_version=edit_version+1 WHERE id=$1",
              [i.id],
            );
          await runner.commitTransaction();
          expect(await outcome).toEqual({
            status: action === 'close' ? 409 : 404,
          });
          expect(
            (await service.submit(i.slug, key, payload, '127.0.0.1')).receipt,
          ).toEqual(accepted.receipt);
        } finally {
          await finish(runner);
          await outcome;
        }
      });
    it('close/unpublish wait for an admitted insert and later requests cannot pass', async () => {
      for (const action of ['close', 'unpublish'] as const) {
        const i = await published(),
          runner = await lock(i.id);
        let mutation: Promise<unknown> | undefined;
        try {
          const hash = canonicalHash(normalizeRsvp(payload));
          await runner.query(
            `INSERT INTO rsvp_responses(id,invitation_id,request_key,payload_hash,name,attendance,party_size,message,created_at) VALUES($1,$2,$3,$4,'Khách','ATTENDING',1,'',clock_timestamp())`,
            [randomUUID(), i.id, randomUUID(), hash],
          );
          mutation =
            action === 'close'
              ? control.set(owner.principal, i.id, {
                  expectedControlVersion: 1,
                  open: false,
                })
              : f.app
                  .get(PublicationService)
                  .unpublishInvitation(owner.principal, i.id, 1);
          await blockedOn(i.id);
          await runner.commitTransaction();
          await mutation;
          await expect(
            service.submit(i.slug, randomUUID(), payload, '127.0.0.1'),
          ).rejects.toMatchObject({ status: action === 'close' ? 409 : 404 });
          expect(
            await f.db.query(
              'SELECT count(*)::int AS n FROM rsvp_responses WHERE invitation_id=$1',
              [i.id],
            ),
          ).toEqual([{ n: 1 }]);
        } finally {
          await finish(runner);
          await mutation;
        }
      }
    });
    it('uses exact open-left ten-minute window with PostgreSQL microseconds and source-specific quota', async () => {
      const i = await published(),
        source = rsvpSourceHash(f.config.rateHmacKey, i.id, '127.0.0.1');
      expect(
        rsvpSourceHash(f.config.rateHmacKey, i.id, '::ffff:127.0.0.1'),
      ).toEqual(source);
      expect(
        rsvpSourceHash(f.config.rateHmacKey, i.id, '2001:0db8::1'),
      ).toEqual(
        rsvpSourceHash(f.config.rateHmacKey, i.id, '2001:db8:0:0:0:0:0:1'),
      );
      const instant = '2026-10-06T01:00:00.000001Z',
        boundary = '2026-10-06T00:50:00.000001Z';
      for (let n = 0; n < 5; n++)
        await f.db.query(
          `INSERT INTO rsvp_responses(id,invitation_id,request_key,payload_hash,name,attendance,party_size,message,source_hash,created_at) VALUES($1,$2,$3,$4,'Khách','ATTENDING',1,'',$5,$6)`,
          [
            randomUUID(),
            i.id,
            randomUUID(),
            canonicalHash(normalizeRsvp(payload)),
            source,
            boundary,
          ],
        );
      await f.db.transaction((m) => enforceRsvpRate(m, i.id, source, instant));
      await f.db.query(
        "UPDATE rsvp_responses SET created_at=created_at+interval '1 microsecond' WHERE invitation_id=$1",
        [i.id],
      );
      await expect(
        f.db.transaction((m) => enforceRsvpRate(m, i.id, source, instant)),
      ).rejects.toMatchObject({ retryAfter: 1 });
      await f.db.transaction((m) =>
        enforceRsvpRate(
          m,
          i.id,
          rsvpSourceHash(f.config.rateHmacKey, i.id, '192.0.2.1'),
          instant,
        ),
      );
    });
    it('enforces quota atomically across distinct keys and never extends receipt time on replay', async () => {
      const i = await published();
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          service.submit(i.slug, randomUUID(), payload, '127.0.0.1'),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const rows: {
        request_key: string;
        created_at: Date;
        source_hash: Buffer;
      }[] = await f.db.query(
        'SELECT request_key,created_at,source_hash FROM rsvp_responses WHERE invitation_id=$1',
        [i.id],
      );
      await service.submit(i.slug, rows[0].request_key, payload, '192.0.2.99');
      expect(
        await f.db.query(
          'SELECT created_at,source_hash FROM rsvp_responses WHERE invitation_id=$1 AND request_key=$2',
          [i.id, rows[0].request_key],
        ),
      ).toEqual([
        { created_at: rows[0].created_at, source_hash: rows[0].source_hash },
      ]);
    });
    it('retains responses/keys while clearing only expired hashes in bounded batches', async () => {
      const i = await published(),
        key = randomUUID();
      await service.submit(i.slug, key, payload, '127.0.0.1');
      await f.db.query(
        "UPDATE rsvp_responses SET created_at=clock_timestamp()-interval '25 hours' WHERE invitation_id=$1",
        [i.id],
      );
      await f.app.get(RsvpRetentionWorker).runOnce();
      const rows: { created_at: Date; source_hash: Buffer | null }[] =
        await f.db.query(
          'SELECT created_at,source_hash FROM rsvp_responses WHERE invitation_id=$1',
          [i.id],
        );
      expect(rows[0].source_hash).toBeNull();
      expect(
        (await service.submit(i.slug, key, payload, '127.0.0.1')).receipt
          .acceptedAt,
      ).toBe(rows[0].created_at.toISOString());
      const fresh = await published();
      await service.submit(fresh.slug, randomUUID(), payload, '127.0.0.1');
      await f.app.get(RsvpRetentionWorker).runOnce();
      expect(
        await f.db.query(
          'SELECT source_hash IS NOT NULL AS kept FROM rsvp_responses WHERE invitation_id=$1',
          [fresh.id],
        ),
      ).toEqual([{ kept: true }]);
    });
    it('clears no more than 500 hashes per cycle without removing receipts, with reversible explicit DDL', async () => {
      await f.app.get(RsvpRetentionWorker).runOnce();
      const i = await published(),
        source = rsvpSourceHash(f.config.rateHmacKey, i.id, '127.0.0.1');
      await f.db.query(
        `INSERT INTO rsvp_responses(id,invitation_id,request_key,payload_hash,name,attendance,party_size,message,source_hash,created_at)
 SELECT gen_random_uuid(),$1,gen_random_uuid(),$2,'Khách','ATTENDING',1,'',$3,clock_timestamp()-interval '25 hours' FROM generate_series(1,501)`,
        [i.id, canonicalHash(normalizeRsvp(payload)), source],
      );
      expect(await f.app.get(RsvpRetentionWorker).runOnce()).toBe(500);
      expect(
        await f.db.query(
          'SELECT count(*)::int AS total,count(source_hash)::int AS remaining FROM rsvp_responses WHERE invitation_id=$1',
          [i.id],
        ),
      ).toEqual([{ total: 501, remaining: 1 }]);
      expect(await f.app.get(RsvpRetentionWorker).runOnce()).toBe(1);
      const runner = f.db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        const migration = new InvitationRsvp20261001000300();
        await migration.down(runner);
        await migration.up(runner);
        expect(
          await runner.query('SELECT count(*)::int AS n FROM rsvp_responses'),
        ).toEqual([{ n: 0 }]);
        await expect(
          runner.query(
            `INSERT INTO rsvp_responses(id,invitation_id,request_key,payload_hash,name,attendance,party_size,created_at) VALUES($1,$2,$3,$4,'Khách','DECLINED',1,clock_timestamp())`,
            [
              randomUUID(),
              i.id,
              randomUUID(),
              canonicalHash(normalizeRsvp(payload)),
            ],
          ),
        ).rejects.toMatchObject({ driverError: { code: '23514' } });
      } finally {
        await finish(runner);
      }
      expect(
        await f.db.query(
          'SELECT count(*)::int AS n FROM rsvp_responses WHERE invitation_id=$1',
          [i.id],
        ),
      ).toEqual([{ n: 501 }]);
    });
    it('pages remain stable after a newer insert and denied roles get no data', async () => {
      const i = await published();
      await service.submit(i.slug, randomUUID(), payload, '127.0.0.1');
      await service.submit(i.slug, randomUUID(), payload, '127.0.0.1');
      const page = await service.list(owner.principal, i.id, { limit: '1' });
      await service.submit(i.slug, randomUUID(), payload, '127.0.0.1');
      const next = await service.list(owner.principal, i.id, {
        limit: '1',
        cursor: page.nextCursor!,
      });
      expect(next.items).toHaveLength(1);
      expect(next.items[0].id).not.toBe(page.items[0].id);
      expect(next.nextCursor).toBeNull();
      await expect(
        service.list(admin.principal, i.id, {}),
      ).rejects.toMatchObject({ status: 403 });
    });
  },
);
