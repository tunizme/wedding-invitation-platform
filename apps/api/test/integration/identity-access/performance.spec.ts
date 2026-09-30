import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { LocalLoginService } from '../../../src/modules/identity-access/auth/local-login.service';
import { RefreshService } from '../../../src/modules/identity-access/auth/refresh.service';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { RetentionWorker } from '../../../src/modules/identity-access/infrastructure/retention.worker';
import { ProfileService } from '../../../src/modules/identity-access/profile/profile.service';
import { registrationFixture } from '../../registration-fixture';

const percentile95 = (samples: number[]) =>
  [...samples].sort((left, right) => left - right)[
    Math.ceil(samples.length * 0.95) - 1
  ];

describe.sequential('IAM service latency budget', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  const password = 'Performance password 🔐';
  const email = 'performance@example.test';

  beforeAll(async () => {
    fixture = await registrationFixture();
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(databaseOptions()), IdentityAccessModule],
    })
      .overrideProvider(IDENTITY_CONFIG)
      .useValue(fixture.config)
      .overrideProvider(EmailOutboxWorker)
      .useValue({})
      .overrideProvider(RetentionWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    await app.init();
    await fixture.db.query(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now())`,
      [email, await fixture.crypto.hashPassword(password)],
    );
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (fixture) await fixture.close();
    }
  });

  it('keeps login, refresh, and profile p95 below 500ms over 20 samples each', async () => {
    const loginDurations: number[] = [];
    const refreshDurations: number[] = [];
    const profileDurations: number[] = [];
    const initial = await app.get(LocalLoginService).login(email, password);
    let refreshToken = initial.session.refreshToken;

    for (let sample = 0; sample < 20; sample += 1) {
      let started = performance.now();
      const login = await app.get(LocalLoginService).login(email, password);
      loginDurations.push(performance.now() - started);

      started = performance.now();
      const rotated = await app.get(RefreshService).rotate(refreshToken);
      refreshDurations.push(performance.now() - started);
      refreshToken = rotated.refreshToken;

      started = performance.now();
      await app.get(ProfileService).get(login.user.id);
      profileDurations.push(performance.now() - started);
    }

    expect(percentile95(loginDurations)).toBeLessThan(500);
    expect(percentile95(refreshDurations)).toBeLessThan(500);
    expect(percentile95(profileDurations)).toBeLessThan(500);
  }, 30_000);
});
