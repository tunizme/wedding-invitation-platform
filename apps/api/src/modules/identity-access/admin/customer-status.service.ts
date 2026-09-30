import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  lockSessions,
  lockUsers,
  transaction,
} from '../infrastructure/transactions';

export type CustomerStatusAction = 'LOCK' | 'UNLOCK';

export class CustomerStatusService {
  constructor(private readonly db: DataSource) {}

  async change(
    actorId: string,
    targetId: string,
    action: CustomerStatusAction,
    requestId: string,
  ): Promise<void> {
    await transaction(this.db, async (manager) => {
      await lockUsers(manager, [actorId, targetId]);
      const users = await manager.query<
        { id: string; role: string; status: string }[]
      >('SELECT id,role,status FROM users WHERE id = ANY($1::uuid[])', [
        [actorId, targetId],
      ]);
      const actor = users.find((user) => user.id === actorId);
      const target = users.find((user) => user.id === targetId);
      if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE')
        throw new ForbiddenException();
      if (!target || target.role !== 'CUSTOMER' || actorId === targetId)
        throw new NotFoundException();

      const next = action === 'LOCK' ? 'LOCKED' : 'ACTIVE';
      const outcome = target.status === next ? 'NO_CHANGE' : 'CHANGED';
      if (action === 'LOCK') {
        await lockSessions(manager, targetId);
        await manager.query(
          `UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),
             revocation_reason=CASE WHEN revoked_at IS NULL THEN 'ACCOUNT_LOCK' ELSE revocation_reason END
           WHERE user_id=$1`,
          [targetId],
        );
      }
      if (outcome === 'CHANGED')
        await manager.query(
          'UPDATE users SET status=$2,updated_at=now() WHERE id=$1',
          [targetId, next],
        );
      await manager.query(
        `INSERT INTO admin_audit_events
          (actor_user_id,target_user_id,action,outcome,previous_status,new_status,occurred_at,request_id,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,now(),$7,'{}'::jsonb)`,
        [
          actorId,
          targetId,
          action === 'LOCK' ? 'CUSTOMER_LOCKED' : 'CUSTOMER_UNLOCKED',
          outcome,
          target.status,
          next,
          requestId,
        ],
      );
    });
  }
}
