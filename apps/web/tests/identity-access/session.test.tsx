import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessSession } from '../../src/features/identity-access/api/client';
import {
  ApiError,
  iamRequest,
} from '../../src/features/identity-access/api/client';
import { SessionProvider } from '../../src/features/identity-access/session/session-provider';
import {
  acceptPeerSession,
  authenticatedRequest,
  bootstrapSession,
  logoutAll,
  logoutCurrent,
} from '../../src/features/identity-access/session/refresh-coordinator';
import { sessionStore } from '../../src/features/identity-access/session/store';

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));

const session: AccessSession = {
  accessToken: 'access-one',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'csrf-one',
  user: {
    id: 'b8f83023-4db8-4a4f-88b9-5d78a3eb9581',
    email: 'person@example.test',
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
afterEach(() => cleanup());

describe('frontend session coordination', () => {
  it('bootstraps once for concurrent callers and never retries refresh itself', async () => {
    vi.mocked(iamRequest)
      .mockResolvedValueOnce({ csrfToken: 'csrf-one' })
      .mockResolvedValueOnce(session);
    const [first, second] = await Promise.all([
      bootstrapSession(),
      bootstrapSession(),
    ]);
    expect(first).toEqual(session);
    expect(second).toEqual(session);
    expect(iamRequest).toHaveBeenCalledTimes(2);
    expect(iamRequest).toHaveBeenNthCalledWith(1, '/auth/csrf', {
      cookieAuth: true,
    });
    expect(iamRequest).toHaveBeenNthCalledWith(2, '/auth/refresh', {
      method: 'POST',
      cookieAuth: true,
      csrfToken: 'csrf-one',
    });
  });

  it('waits for the tab holding the refresh lock and adopts its memory session', async () => {
    const original = navigator.locks;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: vi.fn(
          (
            _name: string,
            _options: LockOptions,
            callback: (lock: Lock | null) => Promise<AccessSession | null>,
          ) => callback(null),
        ),
      },
    });
    try {
      const pending = bootstrapSession();
      acceptPeerSession({ type: 'session', session });
      await expect(pending).resolves.toEqual(session);
      expect(iamRequest).not.toHaveBeenCalled();
      expect(sessionStore.get()).toEqual(session);
    } finally {
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: original,
      });
    }
  });

  it('retries an API request once after refresh and does not loop', async () => {
    sessionStore.set(session);
    vi.mocked(iamRequest)
      .mockRejectedValueOnce(new ApiError(401))
      .mockResolvedValueOnce({ csrfToken: 'csrf-two' })
      .mockResolvedValueOnce({ ...session, accessToken: 'access-two' })
      .mockRejectedValueOnce(new ApiError(401));
    await expect(authenticatedRequest('/me')).rejects.toMatchObject({
      status: 401,
    });
    expect(iamRequest).toHaveBeenCalledTimes(4);
  });

  it('never routes a failed refresh request back through refresh', async () => {
    vi.mocked(iamRequest).mockRejectedValue(new ApiError(401));
    await expect(
      authenticatedRequest('/auth/refresh', {
        method: 'POST',
        cookieAuth: true,
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(iamRequest).toHaveBeenCalledTimes(1);
  });

  it('clears memory and requires login when a rotated response is lost', async () => {
    sessionStore.set(session);
    vi.mocked(iamRequest)
      .mockResolvedValueOnce({ csrfToken: 'csrf-one' })
      .mockRejectedValueOnce(new ApiError(0));
    await expect(bootstrapSession()).resolves.toBeNull();
    expect(sessionStore.get()).toBeNull();
    expect(iamRequest).toHaveBeenCalledTimes(2);
  });

  it('clears memory on logout even when the API is unavailable', async () => {
    sessionStore.set(session);
    vi.mocked(iamRequest).mockRejectedValue(new ApiError(0));
    await expect(logoutCurrent()).resolves.toBeUndefined();
    expect(sessionStore.get()).toBeNull();
  });

  it('clears memory after an unavailable logout-all request', async () => {
    sessionStore.set(session);
    vi.mocked(iamRequest).mockRejectedValue(new ApiError(0));
    await expect(logoutAll()).resolves.toBeUndefined();
    expect(sessionStore.get()).toBeNull();
    expect(iamRequest).toHaveBeenCalledWith('/auth/logout-all', {
      method: 'POST',
      cookieAuth: true,
      accessToken: session.accessToken,
    });
  });

  it('does not block public UI while bootstrap is pending or fails', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(iamRequest).mockImplementation(
      () => new Promise((_, fail) => (reject = fail)),
    );
    render(
      <SessionProvider>
        <p>Nội dung công khai</p>
      </SessionProvider>,
    );
    expect(screen.getByText('Nội dung công khai')).toBeInTheDocument();
    await act(async () => reject(new ApiError(0)));
    await waitFor(() => expect(sessionStore.get()).toBeNull());
  });
});
