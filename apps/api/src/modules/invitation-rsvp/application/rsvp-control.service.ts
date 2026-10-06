import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import type { Invitation } from '../../invitations/domain/entities';
import { requireOwnedInvitation } from '../../invitations/authorization/invitation.policy';
import {
  closedObject,
  positiveVersion,
} from '../../invitation-builder/http/input';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
/** Assistance adapters supply their authorization/audit inside the same transaction. */
export interface RsvpControlPolicy {
  authorize: (
    manager: EntityManager,
    id: string,
    actor: AuthenticatedPrincipal,
  ) => Promise<Invitation>;
  committed?: (
    manager: EntityManager,
    row: Invitation,
    changed: boolean,
  ) => Promise<void>;
}
@Injectable()
export class RsvpControlService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}
  async set(
    actor: AuthenticatedPrincipal,
    id: string,
    body: unknown,
    policy: RsvpControlPolicy = {
      authorize: (m, i, a) => requireOwnedInvitation(m, i, a, true),
    },
  ) {
    const input = closedObject(body, ['expectedControlVersion', 'open']),
      version = positiveVersion(input.expectedControlVersion);
    if (typeof input.open !== 'boolean')
      throw new UnprocessableEntityException();
    return this.db.transaction(async (manager) => {
      const row = await policy.authorize(manager, id, actor);
      if (row.control_version !== version)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      const changed = row.rsvp_open !== input.open;
      if (changed) {
        const updated: Invitation[] = await manager.query(
          `WITH changed AS (UPDATE invitations SET rsvp_open=$2,control_version=control_version+1,updated_by=$3,updated_at=clock_timestamp() WHERE id=$1 RETURNING *) SELECT * FROM changed`,
          [row.id, input.open, actor.userId],
        );
        Object.assign(row, updated[0]);
      }
      await policy.committed?.(manager, row, changed);
      return { controlVersion: row.control_version, rsvpOpen: row.rsvp_open };
    });
  }
}
