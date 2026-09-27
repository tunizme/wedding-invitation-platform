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
