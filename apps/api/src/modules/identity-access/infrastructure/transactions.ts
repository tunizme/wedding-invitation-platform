import type { DataSource, EntityManager } from 'typeorm';

// Callbacks must contain database work only; network effects must happen after commit.
export async function transaction<T>(
  db: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(work);
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : undefined;
      if (attempt >= 2 || (code !== '40001' && code !== '40P01')) throw error;
    }
  }
}

/**
 * 006 lock hierarchy (research R12 L-proof):
 *   L0  auth_contexts            — lockContexts, ALWAYS the first lock taken
 *       existing 003 order       — advisory subject → identities → users → sessions → …
 *   L∞  auth_cookie_names        — lockCookieNames, ALWAYS the last lock taken
 * Never acquire L0 after any other lock, and never take another lock after L∞.
 * Account-wide revocation paths (password, logout-all, admin lock) never take L0.
 */
export async function lockContexts(
  manager: EntityManager,
  ids: readonly string[],
): Promise<void> {
  if (!ids.length) return;
  await manager.query(
    'SELECT id FROM auth_contexts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [[...new Set(ids)].sort()],
  );
}

/** L∞: serializes capacity check-and-emit per group (re-entrant within a tx). */
export async function lockCookieGroup(
  manager: EntityManager,
  groupId: string,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `wa-cookie-group:${groupId}`,
  ]);
}

export async function lockCookieNames(
  manager: EntityManager,
  groupId: string,
  names: readonly string[],
): Promise<void> {
  await lockCookieGroup(manager, groupId);
  if (!names.length) return;
  await manager.query(
    'SELECT name FROM auth_cookie_names WHERE group_id = $1 AND name = ANY($2::text[]) ORDER BY name FOR UPDATE',
    [groupId, [...new Set(names)].sort()],
  );
}

export async function lockUsers(
  manager: EntityManager,
  ids: readonly string[],
): Promise<void> {
  await manager.query(
    'SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [[...new Set(ids)].sort()],
  );
}

export async function lockSessions(
  manager: EntityManager,
  userId: string,
): Promise<void> {
  await manager.query(
    'SELECT id FROM auth_sessions WHERE user_id = $1 ORDER BY id FOR UPDATE',
    [userId],
  );
}
