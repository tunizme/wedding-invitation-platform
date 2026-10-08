import { DataSource, type EntityManager } from 'typeorm';
import { databaseOptions } from '../../../infrastructure/database/data-source';
import {
  transaction,
  lockContexts,
  lockSessions,
  lockUsers,
} from '../infrastructure/transactions';

/**
 * Explicitly destructive rollback aid for CSP-1 operations.
 * Revoking these sessions loses their active login state; users must log in
 * again after cutover. Callers must provide the exact confirmation phrase.
 */
export class AuthCutoverCommand {
  constructor(private readonly db: DataSource) {}

  async revokeContextSessions(confirmation: string): Promise<number> {
    if (confirmation !== 'REVOKE_CONTEXT_SESSIONS')
      throw new Error('Explicit rollback confirmation is required');

    return transaction(this.db, async (manager: EntityManager) => {
      const rows = await manager.query<
        Array<{ id: string; user_id: string; context_id: string }>
      >(
        `SELECT id,user_id,context_id FROM auth_sessions
         WHERE context_id IS NOT NULL AND revoked_at IS NULL
         ORDER BY context_id,id`,
      );
      if (!rows.length) return 0;

      const contextIds = [...new Set(rows.map((row) => row.context_id))].sort();
      const userIds = [...new Set(rows.map((row) => row.user_id))].sort();
      // Preserve the shared lock order: contexts (L0), users, then sessions.
      await lockContexts(manager, contextIds);
      await lockUsers(manager, userIds);
      for (const userId of userIds) await lockSessions(manager, userId);

      const ids = rows.map((row) => row.id);
      await manager.query(
        `UPDATE auth_sessions SET revoked_at=now(),revocation_reason='SUPERSEDED'
         WHERE id = ANY($1::uuid[]) AND revoked_at IS NULL`,
        [ids],
      );
      await manager.query(
        `UPDATE auth_contexts SET current_session_id=NULL
         WHERE id = ANY($1::uuid[])`,
        [contextIds],
      );
      return rows.length;
    });
  }
}

if (require.main === module) {
  const confirmation = process.argv[2] ?? '';
  const db = new DataSource(databaseOptions());
  void db
    .initialize()
    .then(async () => {
      const count = await new AuthCutoverCommand(db).revokeContextSessions(
        confirmation,
      );
      process.stdout.write(
        `Revoked ${count} context-bound session(s). Users must sign in again.\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'Cutover rollback failed'}\n`,
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      if (db.isInitialized) await db.destroy();
    });
}
