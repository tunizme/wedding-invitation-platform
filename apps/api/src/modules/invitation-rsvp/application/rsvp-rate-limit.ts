import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { EntityManager } from 'typeorm';
import { RateLimitExceeded } from '../../identity-access/infrastructure/rate-limit.service';
export function rsvpSourceHash(
  secret: Buffer,
  invitationId: string,
  address: string | undefined,
): Buffer {
  let source = (address ?? 'unknown').toLowerCase();
  if (source.startsWith('::ffff:') && isIP(source.slice(7)) === 4)
    source = source.slice(7);
  if (isIP(source) === 6)
    source = new URL(`http://[${source}]/`).hostname.slice(1, -1);
  return createHmac('sha256', secret)
    .update(JSON.stringify([invitationId, source]))
    .digest();
}
/** Caller holds the invitation row lock until the acceptance INSERT commits. */
export async function enforceRsvpRate(
  manager: EntityManager,
  id: string,
  source: Buffer,
  acceptedAt: string,
): Promise<void> {
  const rows: { retry_after: number }[] = await manager.query(
    `SELECT ceil(extract(epoch FROM (min(created_at)+interval '10 minutes'-$3::timestamptz)))::integer AS retry_after
 FROM rsvp_responses WHERE invitation_id=$1 AND source_hash=$2
 AND created_at>$3::timestamptz-interval '10 minutes' AND created_at<=$3::timestamptz HAVING count(*)>=5`,
    [id, source, acceptedAt],
  );
  if (rows[0]) throw new RateLimitExceeded(Math.max(1, rows[0].retry_after));
}
