import { createHmac } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import type { DataSource } from 'typeorm';
import type {
  IdentityEnvironment,
  RateAction,
} from '../../../config/identity-access.environment';

export class RateLimitExceeded extends HttpException {
  constructor(readonly retryAfter: number) {
    super('RATE_LIMITED', 429);
  }
}

export class RateLimitService {
  constructor(
    private readonly db: DataSource,
    private readonly config: IdentityEnvironment,
  ) {}
  // Express trust proxy remains false. Forwarded/X-Forwarded-For never supplies limiter identity.
  ip(request: Pick<Request, 'socket'>): string {
    return request.socket.remoteAddress ?? 'unknown';
  }
  async consumeProof(
    challengeId: string | undefined,
    ip: string,
  ): Promise<void> {
    if (!challengeId) return this.consume('PROOF_UNKNOWN_IP', ip);
    const rows = await this.db.query<{ id: string }[]>(
      'WITH attempted AS (UPDATE auth_challenges SET attempt_count = attempt_count + 1 WHERE id = $1 AND attempt_count < 5 RETURNING id) SELECT id FROM attempted',
      [challengeId],
    );
    if (!rows.length) throw new RateLimitExceeded(3600);
  }
  async consume(
    action: RateAction,
    subject: string,
    now = Date.now(),
  ): Promise<void> {
    const { limit, seconds } = this.config.rates[action];
    const window = Math.floor(now / (seconds * 1000)) * seconds * 1000;
    const digest = createHmac(
      'sha256',
      this.config.rateKeys[this.config.keyVersion],
    )
      .update(JSON.stringify([action, subject]))
      .digest();
    const [row] = await this.db.query<{ count: number }[]>(
      'INSERT INTO auth_rate_limit_buckets (action,subject_hash,hash_key_version,window_started_at,count,expires_at) VALUES ($1,$2,$3,$4,1,$5) ON CONFLICT (action,subject_hash,window_started_at) DO UPDATE SET count = LEAST(auth_rate_limit_buckets.count, 2147483646) + 1 RETURNING count',
      [
        action,
        digest,
        this.config.keyVersion,
        new Date(window),
        new Date(window + (seconds + 86400) * 1000),
      ],
    );
    if (row.count > limit)
      throw new RateLimitExceeded(
        Math.max(1, Math.ceil((window + seconds * 1000 - now) / 1000)),
      );
  }
}
