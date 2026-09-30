import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapAdmin } from '../../../src/modules/identity-access/admin/bootstrap-admin.command';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('bootstrap ADMIN operational command', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  beforeAll(async () => {
    fixture = await registrationFixture();
  });
  beforeEach(async () => fixture.clear());
  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it('provisions a verified LOCAL ADMIN and is idempotent without returning a secret', async () => {
    const first = await bootstrapAdmin(fixture.db, fixture.crypto, {
      email: ' First.Admin@Example.Test ',
      password: 'Bootstrap password 🔐',
    });
    const second = await bootstrapAdmin(fixture.db, fixture.crypto, {
      email: 'first.admin@example.test',
      password: 'Different ignored password 🔐',
    });
    expect(first).toEqual({ outcome: 'CREATED' });
    expect(second).toEqual({ outcome: 'ALREADY_EXISTS' });
    expect(JSON.stringify([first, second])).not.toMatch(
      /password|secret|hash|first\.admin/i,
    );
    const [user] = await fixture.db.query<
      {
        role: string;
        status: string;
        email_verified_at: Date | null;
        password_hash: string;
      }[]
    >('SELECT role,status,email_verified_at,password_hash FROM users');
    expect(user).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
    expect(user.email_verified_at).toBeInstanceOf(Date);
    expect(
      await fixture.crypto.verifyPassword(
        user.password_hash,
        'Bootstrap password 🔐',
      ),
    ).toBe(true);
  });

  it('refuses to promote an existing Customer', async () => {
    await fixture.db.query(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),'customer@example.test',$1,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now())`,
      [await fixture.crypto.hashPassword('Customer password!')],
    );
    await expect(
      bootstrapAdmin(fixture.db, fixture.crypto, {
        email: 'customer@example.test',
        password: 'Bootstrap password 🔐',
      }),
    ).rejects.toThrow('ADMIN_BOOTSTRAP_EMAIL_IN_USE');
    const [user] = await fixture.db.query<{ role: string }[]>(
      'SELECT role FROM users',
    );
    expect(user.role).toBe('CUSTOMER');
  });
});
