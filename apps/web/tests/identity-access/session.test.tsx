import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
import { acquireRefreshLease } from '../../src/features/identity-access/session/auth-selector';
import { useDirtyNavigationGuard } from '../../src/features/identity-access/session/navigation-guard';
import { sessionStore } from '../../src/features/identity-access/session/store';
import {
  CONTEXT_ID,
  TAG,
  installSelectedSelector,
  protocolSession,
} from './auth-protocol-mock';

// 006 (T062 allowlist): 003 session tests updated for CSP-1 — refresh now
// carries context headers and requires a selected context (FR-001/FR-014);
// peer sessions are adopted only when they match the selector (FR-001).

const route = vi.hoisted(() => ({ pathname: '/account' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));

const session: AccessSession = protocolSession({
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
});
const auth = { contextId: CONTEXT_ID, sessionTag: TAG };

beforeEach(async () => {
  route.pathname = '/account';
  vi.mocked(iamRequest).mockReset();
  sessionStore.clear();
  await installSelectedSelector();
});
afterEach(() => cleanup());

describe('frontend session coordination', () => {
  it('does not rotate the auth cookie on public invitations or the capture shell', async () => {
    route.pathname = '/i/00000000-0000-4000-8000-000000000001';
    render(
      <SessionProvider>
        <span>public</span>
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('public')).toBeTruthy());
    expect(iamRequest).not.toHaveBeenCalled();
    cleanup();
    route.pathname = '/internal/invitation-renderer';
    render(
      <SessionProvider>
        <span>capture</span>
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('capture')).toBeTruthy());
    expect(iamRequest).not.toHaveBeenCalled();
  });

  it('asks before user logout with dirty data and does not block forced revocation', () => {
    function DirtyForm() {
      useDirtyNavigationGuard(true);
      return <input defaultValue="Local edits" aria-label="Draft" />;
    }
    route.pathname = '/i/00000000-0000-4000-8000-000000000001';
    sessionStore.set(session);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <SessionProvider>
        <DirtyForm />
      </SessionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Đăng xuất mọi thiết bị' }),
    );
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(iamRequest).not.toHaveBeenCalled();
    expect(sessionStore.get()).toEqual(session);
    expect(screen.getByLabelText('Draft')).toHaveValue('Local edits');
    act(() => sessionStore.clear());
    expect(sessionStore.get()).toBeNull();
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

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
      auth,
    });
    expect(iamRequest).toHaveBeenNthCalledWith(2, '/auth/refresh', {
      method: 'POST',
      cookieAuth: true,
      csrfToken: 'csrf-one',
      auth,
      expectProtocol: true,
    });
  });

  it('waits for the tab holding the refresh lease and adopts only a matching peer session', async () => {
    const store = await installSelectedSelector();
    await acquireRefreshLease(store, 'other-tab');
    const pending = bootstrapSession(true);
    await acceptPeerSession({
      type: 'session',
      session,
      admission: { contextId: CONTEXT_ID, sessionTag: TAG, contextRevision: 1 },
    });
    await expect(pending).resolves.toEqual(session);
    expect(iamRequest).not.toHaveBeenCalled();
    expect(sessionStore.get()).toEqual(session);
  });

  it('ignores a peer session that does not match the selected context', async () => {
    await acceptPeerSession({
      type: 'session',
      session,
      admission: {
        contextId: CONTEXT_ID,
        sessionTag: 'ZZZZZZZZZZZZZZZZZZZZZZ',
        contextRevision: 9,
      },
    });
    expect(sessionStore.get()).toBeNull();
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
      .mockRejectedValueOnce(new ApiError(0, undefined, 'UNCERTAIN'));
    await expect(bootstrapSession(true)).resolves.toBeNull();
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
    await waitFor(() => expect(iamRequest).toHaveBeenCalled());
    await act(async () => reject(new ApiError(0)));
    await waitFor(() => expect(sessionStore.get()).toBeNull());
  });
});
