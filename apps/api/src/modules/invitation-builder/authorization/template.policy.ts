import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import type { InvitationTemplate } from '../domain/entities';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import { positiveVersion, resourceId } from '../http/input';

export function assertVersion(current: number, expected: number): void {
  positiveVersion(expected);
  if (current !== expected)
    throw new BuilderProblemException(409, 'VERSION_CONFLICT');
}

export async function requireTemplate(
  manager: EntityManager,
  id: string,
  actor: AuthenticatedPrincipal,
  lock = false,
): Promise<InvitationTemplate> {
  if (actor.role !== 'ADMIN') throw new ForbiddenException();
  resourceId(id);
  const rows: InvitationTemplate[] = await manager.query(
    `SELECT * FROM invitation_templates WHERE id=$1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new NotFoundException();
  // Ordinary management retains IAM access-token semantics. Live status checks
  // are specific to assisted customer mutations, not retrofitted here.
  return rows[0];
}
