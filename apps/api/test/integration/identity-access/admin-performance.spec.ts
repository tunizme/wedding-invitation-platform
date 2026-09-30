import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CustomerQueryService } from '../../../src/modules/identity-access/admin/customer-query.service';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('Admin Customer search performance', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  beforeAll(async () => {
    fixture = await registrationFixture();
    await fixture.db.query(`
      INSERT INTO users
        (id,email,password_hash,login_method,role,status,email_verified_at,display_name,created_at,updated_at)
      SELECT gen_random_uuid(), 'customer-' || value || '@example.test', '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
             'LOCAL','CUSTOMER',CASE WHEN value % 7 = 0 THEN 'LOCKED' ELSE 'ACTIVE' END,
             now(),'Customer ' || value,now() - (value || ' milliseconds')::interval,now()
      FROM generate_series(1,100000) value
    `);
    await fixture.db.query('ANALYZE users');
  }, 120_000);
  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it('returns the first filtered substring-search page within two seconds at 100k rows', async () => {
    const service = new CustomerQueryService(fixture.db, fixture.config);
    const started = performance.now();
    const page = await service.list({
      q: 'customer-999',
      status: 'ACTIVE',
      limit: 20,
    });
    const duration = performance.now() - started;
    expect(page.items.length).toBeGreaterThan(0);
    expect(
      page.items.every(
        (item) => item.role === 'CUSTOMER' && item.status === 'ACTIVE',
      ),
    ).toBe(true);
    expect(duration).toBeLessThan(2_000);
  });
});
