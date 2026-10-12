import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
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
import {
  acquireRefreshLease,
  releaseRefreshLease,
} from '../../src/features/identity-access/session/auth-selector';
import { createOperationScope } from '../../src/features/identity-access/session/operation-scope';
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
  it('does not reuse the rejected cached credential while another tab holds the renewal lease', async () => {
    const store = await installSelectedSelector();
    sessionStore.set(session, {
      contextId: CONTEXT_ID,
      sessionTag: TAG,
      contextRevision: 1,
    });
    await acquireRefreshLease(store, 'other-tab');
    vi.mocked(iamRequest)
      .mockResolvedValueOnce({ csrfToken: 'csrf-renewed' })
      .mockResolvedValueOnce({ ...session, accessToken: 'access-renewed' });
    let settled = false;
    const pending = bootstrapSession(true).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(settled).toBe(false);
    expect(iamRequest).not.toHaveBeenCalled();
    await releaseRefreshLease(store, 'other-tab');
    await expect(pending).resolves.toMatchObject({
      accessToken: 'access-renewed',
    });
  });
  it('leaves OAuth result renewal to its originating intent instead of bootstrapping the selected peer session', async () => {
    route.pathname = '/oauth-result';
    render(
      <SessionProvider>
        <span>OAuth result</span>
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('OAuth result')).toBeVisible());
    expect(iamRequest).not.toHaveBeenCalled();
  });

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
    sessionStore.set(session, {
      contextId: CONTEXT_ID,
      sessionTag: TAG,
      contextRevision: 1,
    });
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

  describe('private lifetime and operation knowledge (005 US1)', () => {
    const admission = (tag = TAG, contextId = CONTEXT_ID) => ({
      contextId,
      sessionTag: tag,
      contextRevision: 1,
    });
    const userB = {
      ...session.user,
      id: 'c2d63a55-1c7a-4f86-9d3b-6b7f5a8e0b22',
      email: 'other@example.test',
    };

    it('bumps the identity epoch on account, role, status, null and admitted context/tag changes', () => {
      const base = () => {
        sessionStore.clear();
        sessionStore.set(session, admission());
        return sessionStore.identityEpoch();
      };
      let epoch = base();
      sessionStore.set({ ...session, user: userB }, admission());
      expect(sessionStore.identityEpoch()).toBeGreaterThan(epoch);
      epoch = base();
      sessionStore.set(
        { ...session, user: { ...session.user, role: 'ADMIN' } },
        admission(),
      );
      expect(sessionStore.identityEpoch()).toBeGreaterThan(epoch);
      epoch = base();
      sessionStore.set(
        { ...session, user: { ...session.user, status: 'LOCKED' } },
        admission(),
      );
      expect(sessionStore.identityEpoch()).toBeGreaterThan(epoch);
      epoch = base();
      sessionStore.set(session, admission('BBBBBBBBBBBBBBBBBBBBBB'));
      expect(sessionStore.identityEpoch()).toBeGreaterThan(epoch);
      epoch = base();
      sessionStore.set(
        session,
        admission(TAG, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
      );
      expect(sessionStore.identityEpoch()).toBeGreaterThan(epoch);
      epoch = base();
      sessionStore.clear();
      expect(sessionStore.identityEpoch()).toBeGreaterThan(epoch);
    });

    it('keeps the identity epoch for same-owner token and profile renewal', () => {
      sessionStore.clear();
      sessionStore.set(session, admission());
      const epoch = sessionStore.identityEpoch();
      sessionStore.set(
        {
          ...session,
          accessToken: 'renewed',
          csrfToken: 'renewed-csrf',
          user: { ...session.user, displayName: 'Tên mới' },
        },
        admission(),
      );
      expect(sessionStore.identityEpoch()).toBe(epoch);
      expect(sessionStore.get()?.accessToken).toBe('renewed');
    });

    it('reports NOT_DISPATCHED for a scope that ended before dispatch and never sends it', async () => {
      sessionStore.set(session, admission());
      const scope = createOperationScope('resource');
      sessionStore.set({ ...session, user: userB }, admission());
      await expect(
        authenticatedRequest('/me', { scope }),
      ).rejects.toMatchObject({
        code: 'SUPERSEDED',
        knowledge: 'NOT_DISPATCHED',
      });
      expect(iamRequest).not.toHaveBeenCalled();
    });

    it('reports UNCERTAIN, not NOT_DISPATCHED, when the owner ends after dispatch', async () => {
      sessionStore.set(session, admission());
      let resolve!: (value: unknown) => void;
      vi.mocked(iamRequest).mockImplementation(
        () => new Promise((done) => (resolve = done)),
      );
      const pending = authenticatedRequest('/me', { method: 'PATCH' });
      sessionStore.set({ ...session, user: userB }, admission());
      resolve({ displayName: 'private A' });
      await expect(pending).rejects.toMatchObject({
        code: 'SUPERSEDED',
        knowledge: 'UNCERTAIN',
      });
      expect(iamRequest).toHaveBeenCalledTimes(1);
    });

    it('surfaces a parsed server error as COMPLETED and a lost response as UNCERTAIN without replay', async () => {
      sessionStore.set(session, admission());
      vi.mocked(iamRequest).mockRejectedValueOnce(
        new ApiError(409, 'VERSION_CONFLICT', 'COMPLETED'),
      );
      await expect(
        authenticatedRequest('/me', { method: 'PATCH' }),
      ).rejects.toMatchObject({ status: 409, knowledge: 'COMPLETED' });
      vi.mocked(iamRequest).mockRejectedValueOnce(
        new ApiError(0, 'NETWORK_ERROR', 'UNCERTAIN'),
      );
      await expect(
        authenticatedRequest('/me', { method: 'PATCH' }),
      ).rejects.toMatchObject({ knowledge: 'UNCERTAIN' });
      expect(iamRequest).toHaveBeenCalledTimes(2);
    });

    it('does not retry A payload as B when the account changes during the 401 refresh wait', async () => {
      sessionStore.set(session, admission());
      let releaseCsrf!: (value: unknown) => void;
      vi.mocked(iamRequest)
        .mockRejectedValueOnce(new ApiError(401))
        .mockImplementationOnce(
          () => new Promise((done) => (releaseCsrf = done)),
        );
      const pending = authenticatedRequest('/me', {
        method: 'PATCH',
        body: { displayName: 'private A' },
      });
      await waitFor(() => expect(iamRequest).toHaveBeenCalledTimes(2));
      sessionStore.set({ ...session, user: userB }, admission());
      releaseCsrf({ csrfToken: 'csrf-late' });
      await expect(pending).rejects.toMatchObject({ code: 'SUPERSEDED' });
      // 006's coordinator may still finish its own refresh for A's captured
      // context/tag; what 005 must guarantee is that A's request is sent once
      // and never replayed after B was admitted.
      const sent = vi
        .mocked(iamRequest)
        .mock.calls.filter(([path]) => path === '/me');
      expect(sent).toHaveLength(1);
    });

    it('never dispatches the retry when the refresh admits another account', async () => {
      sessionStore.set(session, admission());
      vi.mocked(iamRequest)
        .mockRejectedValueOnce(new ApiError(401))
        .mockResolvedValueOnce({ csrfToken: 'csrf-two' })
        .mockResolvedValueOnce({
          ...session,
          user: userB,
          accessToken: 'access-b',
        });
      await expect(
        authenticatedRequest('/me', { method: 'PATCH', body: { x: 1 } }),
      ).rejects.toMatchObject({ code: 'SUPERSEDED' });
      // first dispatch + csrf + refresh; the retry with B's token never leaves.
      expect(iamRequest).toHaveBeenCalledTimes(3);
      expect(
        vi
          .mocked(iamRequest)
          .mock.calls.some(
            ([, options]) =>
              (options as { accessToken?: string }).accessToken === 'access-b',
          ),
      ).toBe(false);
    });
  });

  it('still refreshes when StrictMode unmounts and remounts the provider at once (next dev)', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(iamRequest).mockImplementation(
      () => new Promise((_, fail) => (reject = fail)),
    );
    render(
      <StrictMode>
        <SessionProvider>
          <p>Nội dung riêng</p>
        </SessionProvider>
      </StrictMode>,
    );
    // The remounted provider shares the first bootstrap flight: that flight must
    // not be cancelled by the intermediate unmount, or no request is ever sent.
    await waitFor(() =>
      expect(iamRequest).toHaveBeenCalledWith(
        '/auth/csrf',
        expect.objectContaining({ cookieAuth: true }),
      ),
    );
    await act(async () => reject(new ApiError(0)));
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
