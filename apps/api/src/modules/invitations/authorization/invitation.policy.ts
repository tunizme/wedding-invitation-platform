import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import { resourceId } from '../../invitation-builder/http/input';
import type { Invitation } from '../domain/entities';

export async function requireOwnedInvitation(
  manager: EntityManager,
  id: string,
  actor: AuthenticatedPrincipal,
  lock = false,
): Promise<Invitation> {
  if (actor.role !== 'CUSTOMER') throw new ForbiddenException();
  resourceId(id);
  const rows: Invitation[] = await manager.query(
    `SELECT * FROM invitations WHERE id=$1 AND owner_user_id=$2${lock ? ' FOR UPDATE' : ''}`,
    [id, actor.userId],
  );
  if (!rows[0]) throw new NotFoundException();
  return rows[0];
}

/** Must be called before any resource/job/asset lock in assisted transactions. */
export async function requireActiveAssistanceUsers(
  manager: EntityManager,
  customerId: string,
  actor: AuthenticatedPrincipal,
  lock = true,
): Promise<void> {
  if (actor.role !== 'ADMIN') throw new ForbiddenException();
  resourceId(customerId);
  const rows: { id: string; role: string; status: string }[] =
    await manager.query(
      `SELECT id,role,status FROM users WHERE id=ANY($1::uuid[]) ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
      [[...new Set([actor.userId, customerId])].sort()],
    );
  if (
    !rows.some(
      (user) =>
        user.id === actor.userId &&
        user.role === 'ADMIN' &&
        user.status === 'ACTIVE',
    )
  )
    throw new ForbiddenException();
  const target = rows.find(
    (user) => user.id === customerId && user.role === 'CUSTOMER',
  );
  if (!target) throw new NotFoundException();
  if (target.status !== 'ACTIVE') throw new ForbiddenException();
}

export async function requireAssistedInvitation(
  manager: EntityManager,
  id: string,
  actor: AuthenticatedPrincipal,
  lock = true,
): Promise<Invitation> {
  if (actor.role !== 'ADMIN') throw new ForbiddenException();
  resourceId(id);
  // Owner is immutable. Read it first to take user locks in global UUID order
  // before the invitation lock, then re-read the authorized resource.
  const owners: { owner_user_id: string }[] = await manager.query(
    'SELECT owner_user_id FROM invitations WHERE id=$1',
    [id],
  );
  if (!owners[0]) throw new NotFoundException();
  await requireActiveAssistanceUsers(
    manager,
    owners[0].owner_user_id,
    actor,
    lock,
  );
  const rows: Invitation[] = await manager.query(
    `SELECT * FROM invitations WHERE id=$1 AND owner_user_id=$2${lock ? ' FOR UPDATE' : ''}`,
    [id, owners[0].owner_user_id],
  );
  if (!rows[0]) throw new NotFoundException();
  return rows[0];
}

export async function requireInvitationAccess(
  manager: EntityManager,
  id: string,
  actor: AuthenticatedPrincipal,
  lock = false,
) {
  return actor.role === 'ADMIN'
    ? requireAssistedInvitation(manager, id, actor, lock)
    : requireOwnedInvitation(manager, id, actor, lock);
}
export function assertInvitationDesignPermission(
  invitation: Invitation,
  actor: AuthenticatedPrincipal,
) {
  if (actor.role === 'ADMIN' && invitation.editing_mode !== 'SERVICE_MANAGED')
    throw new ForbiddenException();
  if (invitation.editing_mode === 'SERVICE_MANAGED' && actor.role !== 'ADMIN')
    throw new ForbiddenException();
}
export function assertInvitationPublishPermission(
  invitation: Invitation,
  actor: AuthenticatedPrincipal,
) {
  assertInvitationDesignPermission(invitation, actor);
  if (invitation.editing_mode === 'SERVICE_MANAGED' && !invitation.paid_at)
    throw new BuilderProblemException(409, 'PAYMENT_REQUIRED');
}
