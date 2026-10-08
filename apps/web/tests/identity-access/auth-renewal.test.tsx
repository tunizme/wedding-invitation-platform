import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessSession } from '../../src/features/identity-access/api/client';
import { iamRequest } from '../../src/features/identity-access/api/client';
import { bootstrapSession } from '../../src/features/identity-access/session/refresh-coordinator';
import { sessionStore } from '../../src/features/identity-access/session/store';
import {
  installSelectedSelector,
  protocolSession,
  TAG,
} from './auth-protocol-mock';

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));

const initial: AccessSession = {
  accessToken: 'access-before-refresh',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'csrf-before-refresh',
  authProtocol: 2,
  sessionTag: TAG,
  contextRevision: 1,
  user: {
    id: 'b8f83023-4db8-4a4f-88b9-5d78a3eb9581',
    email: 'renewal@example.test',
    emailVerified: true,
    loginMethod: 'LOCAL',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    displayName: null,
    phoneNumber: null,
    avatarUrl: null,
  },
};

beforeEach(() => {
  vi.mocked(iamRequest).mockReset();
  sessionStore.clear();
});
afterEach(() => vi.clearAllMocks());

describe('006 same-principal renewal (US4)', () => {
  it('keeps valid unsaved edits when refresh retains the current session tag', async () => {
    await installSelectedSelector();
    sessionStore.set(initial, {
      contextId: '0f0e5a2c-6b1d-4c6a-9a51-2a4a0b6f9d10',
      sessionTag: TAG,
      contextRevision: 1,
    });
    let unsavedEdit = 'A name typed but not saved';
    const endAdmission = vi.fn(() => {
      unsavedEdit = '';
    });
    const unsubscribe = sessionStore.onEndAdmission(endAdmission);
    vi.mocked(iamRequest).mockImplementation((path: string) => {
      if (path === '/auth/csrf')
        return Promise.resolve({ csrfToken: 'csrf-after-refresh' });
      if (path === '/auth/refresh')
        return Promise.resolve(
          protocolSession(
            { ...initial, accessToken: 'access-after-refresh' },
            { contextRevision: 1, sessionTag: TAG },
          ),
        );
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    await expect(bootstrapSession(true)).resolves.toMatchObject({
      accessToken: 'access-after-refresh',
      sessionTag: TAG,
    });
    unsubscribe();

    expect(endAdmission).not.toHaveBeenCalled();
    expect(unsavedEdit).toBe('A name typed but not saved');
    expect(sessionStore.admission()).toMatchObject({ sessionTag: TAG });
  });
});
