import { vi } from 'vitest';
import type { AccessSession } from '../../src/features/identity-access/api/client';
import {
  beginProvisioning,
  commitSelected,
  MemorySelectorStore,
  observeServerState,
  setSelectorStoreForTests,
} from '../../src/features/identity-access/session/auth-selector';

export const CONTEXT_ID = '0f0e5a2c-6b1d-4c6a-9a51-2a4a0b6f9d10';
export const INTENT_ID = '1f0e5a2c-6b1d-4c6a-9a51-2a4a0b6f9d10';
export const TAG = 'AbCdEfGhIjKlMnOpQrStUv';

export function protocolSession(
  session: AccessSession,
  extra: Partial<AccessSession> = {},
): AccessSession {
  return {
    ...session,
    authProtocol: 2,
    sessionTag: TAG,
    contextRevision: 1,
    ...extra,
  };
}

/** Fresh in-memory selector installed as the process store. */
export function installSelector(): MemorySelectorStore {
  const store = new MemorySelectorStore();
  setSelectorStoreForTests(store);
  return store;
}

/** Selector already SELECTED with a current session tag (as after a login). */
export async function installSelectedSelector(revision = 1, tag = TAG) {
  const store = installSelector();
  const attempt = await beginProvisioning(store);
  await commitSelected(store, attempt.attemptId, CONTEXT_ID);
  await observeServerState(store, CONTEXT_ID, revision, tag);
  return store;
}

/**
 * Routes mocked iamRequest calls for the 006 context endpoints; `login` and
 * other paths are delegated to `rest`.
 */
export function routeProtocol(
  mock: ReturnType<typeof vi.fn>,
  rest: (path: string, options: unknown) => Promise<unknown>,
) {
  mock.mockImplementation((path: string, options: unknown) => {
    if (path === '/auth/contexts')
      return Promise.resolve({
        authProtocol: 2,
        contextId: CONTEXT_ID,
        state: 'PROVISIONAL',
        revision: 0,
      });
    if (path === `/auth/contexts/${CONTEXT_ID}/confirm`)
      return Promise.resolve({
        authProtocol: 2,
        contextId: CONTEXT_ID,
        state: 'ACTIVE',
        revision: 0,
        sessionTag: null,
      });
    if (path === `/auth/contexts/${CONTEXT_ID}/intents`)
      return Promise.resolve({
        authProtocol: 2,
        intentId: INTENT_ID,
        kind: 'LOCAL_LOGIN',
        revision: 1,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    return rest(path, options);
  });
}
