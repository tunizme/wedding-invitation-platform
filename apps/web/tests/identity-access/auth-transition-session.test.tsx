import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import OAuthResultPage from '../../src/app/(auth)/oauth-result/page';
import { AuthRecoveryNotice } from '../../src/features/identity-access/session/auth-recovery-notice';
import { ProfileForm } from '../../src/features/identity-access/forms/profile-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessSession } from '../../src/features/identity-access/api/client';
import {
  ApiError,
  iamRequest,
} from '../../src/features/identity-access/api/client';
import {
  SelectorStorageUnavailable,
  acquireRefreshLease,
  beginProvisioning,
  commitSelected,
  observeServerState,
  beginIntent,
  readSelector,
  requireRecovery,
  setSelectorStoreForTests,
} from '../../src/features/identity-access/session/auth-selector';
import {
  acceptPeerSession,
  bootstrapSession,
  authenticatedRequest,
  loginLocal,
  logoutCurrent,
  logoutAll,
} from '../../src/features/identity-access/session/refresh-coordinator';
import {
  ensureContext,
  reserveIntent,
} from '../../src/features/identity-access/session/auth-context-flow';
import { sessionStore } from '../../src/features/identity-access/session/store';
import {
  CONTEXT_ID,
  INTENT_ID,
  TAG,
  installSelectedSelector,
  installSelector,
  protocolSession,
  routeProtocol,
} from './auth-protocol-mock';

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));

const base: AccessSession = {
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
const mocked = () =>
  vi.mocked(iamRequest) as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocked().mockReset();
  sessionStore.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('006 frontend session flows (US1)', () => {
  it('page load without a selected context makes no request and admits nothing', async () => {
    installSelector();
    await expect(bootstrapSession(true)).resolves.toBeNull();
    expect(iamRequest).not.toHaveBeenCalled();
    expect(sessionStore.get()).toBeNull();
  });

  it('storage unavailable ends admission without any request', async () => {
    setSelectorStoreForTests(null);
    sessionStore.set(base);
    await expect(bootstrapSession(true)).resolves.toBeNull();
    expect(iamRequest).not.toHaveBeenCalled();
    expect(sessionStore.lastEndReason()).toBe('STORAGE_UNAVAILABLE');
  });

  it('logs in: provision → confirm → reserve → execute with headers, then admits', async () => {
    const store = installSelector();
    routeProtocol(mocked(), (path) =>
      path === '/auth/login'
        ? Promise.resolve(protocolSession(base))
        : Promise.reject(new Error(`unexpected ${path}`)),
    );
    const session = await loginLocal('person@example.test', 'Exact Password');
    expect(session.sessionTag).toBe(TAG);
    expect(iamRequest).toHaveBeenLastCalledWith(
      '/auth/login',
      expect.objectContaining({
        body: { email: 'person@example.test', password: 'Exact Password' },
        auth: { contextId: CONTEXT_ID, intentId: INTENT_ID },
        expectProtocol: true,
      }),
    );
    expect(sessionStore.admission()).toEqual({
      contextId: CONTEXT_ID,
      sessionTag: TAG,
      contextRevision: 1,
    });
    const record = await readSelector(store);
    expect(record).toMatchObject({
      state: 'SELECTED',
      contextId: CONTEXT_ID,
      sessionTag: TAG,
      revision: 1,
      pendingIntent: null,
    });
  });

  it('refreshes only the selected session with context headers', async () => {
    await installSelectedSelector();
    mocked().mockImplementation((path: string) =>
      path === '/auth/csrf'
        ? Promise.resolve({ csrfToken: 'csrf-one' })
        : Promise.resolve(protocolSession(base)),
    );
    await expect(bootstrapSession(true)).resolves.toMatchObject({
      sessionTag: TAG,
    });
    expect(iamRequest).toHaveBeenNthCalledWith(1, '/auth/csrf', {
      cookieAuth: true,
      auth: { contextId: CONTEXT_ID, sessionTag: TAG },
    });
    expect(iamRequest).toHaveBeenNthCalledWith(2, '/auth/refresh', {
      method: 'POST',
      cookieAuth: true,
      csrfToken: 'csrf-one',
      auth: { contextId: CONTEXT_ID, sessionTag: TAG },
      expectProtocol: true,
    });
  });

  it('never admits a response older than the selector revision', async () => {
    await installSelectedSelector(5);
    mocked().mockImplementation((path: string) =>
      path === '/auth/csrf'
        ? Promise.resolve({ csrfToken: 'csrf-one' })
        : Promise.resolve(protocolSession(base, { contextRevision: 4 })),
    );
    await expect(bootstrapSession(true)).resolves.toBeNull();
    expect(sessionStore.get()).toBeNull();
  });

  it('CREDENTIAL_MISSING requires explicit recovery and never falls back', async () => {
    const store = await installSelectedSelector();
    sessionStore.set(base);
    mocked().mockImplementation((path: string) =>
      path === '/auth/csrf'
        ? Promise.reject(new ApiError(401, 'CREDENTIAL_MISSING'))
        : Promise.reject(new Error('unexpected')),
    );
    await expect(bootstrapSession(true)).resolves.toBeNull();
    expect(sessionStore.lastEndReason()).toBe('CREDENTIAL_MISSING');
    expect(await readSelector(store)).toMatchObject({
      state: 'RECOVERY_REQUIRED',
      recoveryReason: 'CREDENTIAL_MISSING',
    });
  });

  it('local logout ends the session on network failure and keeps LOGOUT pending', async () => {
    const store = await installSelectedSelector();
    sessionStore.set(base);
    mocked().mockImplementation((path: string) =>
      path.endsWith('/intents')
        ? Promise.resolve({
            authProtocol: 2,
            intentId: INTENT_ID,
            kind: 'LOGOUT',
            revision: 2,
            expiresAt: new Date().toISOString(),
          })
        : Promise.reject(new ApiError(0, undefined, 'UNCERTAIN')),
    );
    await logoutCurrent();
    expect(sessionStore.get()).toBeNull();
    expect((await readSelector(store)).pendingIntent?.kind).toBe('LOGOUT');
    mocked().mockReset();
    await expect(bootstrapSession(true)).resolves.toBeNull();
    expect(iamRequest).not.toHaveBeenCalled();
  });

  it('a login result older than a transition known by another tab is not admitted', async () => {
    const store = installSelector();
    routeProtocol(mocked(), async (path) => {
      if (path === '/auth/login') {
        // Another tab already observed a newer transition (revision 3).
        await observeServerState(
          store,
          CONTEXT_ID,
          3,
          'ZZZZZZZZZZZZZZZZZZZZZZ',
        );
        return protocolSession(base, { contextRevision: 1 });
      }
      throw new Error(`unexpected ${path}`);
    });
    await expect(
      loginLocal('person@example.test', 'Exact Password'),
    ).rejects.toMatchObject({ code: 'SUPERSEDED' });
    expect(sessionStore.get()).toBeNull();
    expect((await readSelector(store)).sessionTag).toBe(
      'ZZZZZZZZZZZZZZZZZZZZZZ',
    );
  });
  for (const outcome of [
    'success',
    'SUPERSEDED',
    'CREDENTIAL_MISSING',
    'CONTEXT_UNAVAILABLE',
    'network',
  ] as const) {
    it(`preserves B when an old refresh of A finishes with ${outcome}`, async () => {
      const store = await installSelectedSelector();
      let finish!: (value: unknown) => void;
      let fail!: (error: unknown) => void;
      mocked().mockImplementation((path: string) =>
        path === '/auth/csrf'
          ? Promise.resolve({ csrfToken: 'fixture' })
          : new Promise((resolve, reject) => {
              finish = resolve;
              fail = reject;
            }),
      );
      const pending = bootstrapSession(true);
      await vi.waitFor(() => expect(finish).toBeDefined());
      const tagB = 'BBBBBBBBBBBBBBBBBBBBBB';
      await observeServerState(store, CONTEXT_ID, 2, tagB);
      const b = protocolSession(
        { ...base, user: { ...base.user, email: 'b@example.test' } },
        { sessionTag: tagB, contextRevision: 2 },
      );
      sessionStore.set(b, {
        contextId: CONTEXT_ID,
        sessionTag: tagB,
        contextRevision: 2,
      });
      if (outcome === 'success') finish(protocolSession(base));
      else
        fail(
          new ApiError(
            outcome === 'network' ? 0 : 401,
            outcome === 'network' ? undefined : outcome,
          ),
        );
      await pending;
      expect(sessionStore.get()).toBe(b);
      expect(await readSelector(store)).toMatchObject({
        state: 'SELECTED',
        sessionTag: tagB,
        revision: 2,
      });
    });
  }

  it('never admits a refresh while a LOGOUT with the same response revision is pending', async () => {
    const store = await installSelectedSelector();
    mocked().mockImplementation(async (path: string) => {
      if (path === '/auth/csrf') return { csrfToken: 'fixture' };
      await beginIntent(store, 'LOGOUT');
      return protocolSession(base);
    });
    await bootstrapSession(true);
    expect(sessionStore.get()).toBeNull();
    expect((await readSelector(store)).pendingIntent?.kind).toBe('LOGOUT');
  });

  for (const operation of ['logout', 'logout-all'] as const) {
    it(`ends A locally immediately and preserves B after late ${operation}`, async () => {
      const store = await installSelectedSelector();
      sessionStore.set(protocolSession(base), {
        contextId: CONTEXT_ID,
        sessionTag: TAG,
        contextRevision: 1,
      });
      let finish!: () => void;
      mocked().mockImplementation((path: string) =>
        path.endsWith('/intents')
          ? Promise.resolve({
              authProtocol: 2,
              intentId: INTENT_ID,
              revision: 2,
            })
          : new Promise<void>((resolve) => {
              finish = resolve;
            }),
      );
      const pending = operation === 'logout' ? logoutCurrent() : logoutAll();
      expect(sessionStore.get()).toBeNull();
      await vi.waitFor(() => expect(finish).toBeDefined());
      const tagB = 'BBBBBBBBBBBBBBBBBBBBBB';
      await beginIntent(store, 'LOCAL_LOGIN');
      await observeServerState(store, CONTEXT_ID, 3, tagB);
      const b = protocolSession(
        { ...base, user: { ...base.user, email: 'b@example.test' } },
        { sessionTag: tagB, contextRevision: 3 },
      );
      sessionStore.set(b, {
        contextId: CONTEXT_ID,
        sessionTag: tagB,
        contextRevision: 3,
      });
      finish();
      await pending;
      expect(sessionStore.get()).toBe(b);
      expect((await readSelector(store)).sessionTag).toBe(tagB);
    });
  }

  it('a late password change of A cannot clear the session admitted for B', async () => {
    const store = await installSelectedSelector();
    sessionStore.set(protocolSession(base), {
      contextId: CONTEXT_ID,
      sessionTag: TAG,
      contextRevision: 1,
    });
    let finish!: () => void;
    mocked().mockImplementation((path: string) =>
      path === '/me'
        ? Promise.resolve(sessionStore.get()?.user)
        : new Promise<void>((resolve) => {
            finish = resolve;
          }),
    );
    render(<ProfileForm />);
    await screen.findByText('Email: person@example.test');
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {
      target: { value: 'Current password' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
      target: { value: 'Replacement password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    await vi.waitFor(() => expect(finish).toBeDefined());
    const tagB = 'BBBBBBBBBBBBBBBBBBBBBB';
    const b = protocolSession(
      {
        ...base,
        accessToken: 'access-b',
        user: { ...base.user, email: 'b@example.test' },
      },
      { sessionTag: tagB, contextRevision: 2 },
    );
    await observeServerState(store, CONTEXT_ID, 2, tagB);
    act(() =>
      sessionStore.set(b, {
        contextId: CONTEXT_ID,
        sessionTag: tagB,
        contextRevision: 2,
      }),
    );
    await act(async () => {
      finish();
    });
    expect(sessionStore.get()).toBe(b);
  });
  it('does not replay an old password request under the newly admitted B after a late 401', async () => {
    const store = await installSelectedSelector();
    sessionStore.set(protocolSession(base), {
      contextId: CONTEXT_ID,
      sessionTag: TAG,
      contextRevision: 1,
    });
    let deny!: (error: unknown) => void;
    let first = true;
    const tagB = 'BBBBBBBBBBBBBBBBBBBBBB';
    const b = protocolSession(
      {
        ...base,
        accessToken: 'access-b',
        user: {
          ...base.user,
          id: '2f0e5a2c-6b1d-4c6a-9a51-2a4a0b6f9d10',
          email: 'b@example.test',
        },
      },
      { sessionTag: tagB, contextRevision: 2 },
    );
    mocked().mockImplementation((path: string) => {
      if (path === '/auth/csrf')
        return Promise.resolve({ csrfToken: 'fixture' });
      if (path === '/auth/refresh') return Promise.resolve(b);
      if (first) {
        first = false;
        return new Promise((_resolve, reject) => {
          deny = reject;
        });
      }
      return Promise.resolve(undefined);
    });
    const pending = authenticatedRequest('/me/password', {
      method: 'POST',
      body: { currentPassword: 'fixture', newPassword: 'fixture-new' },
    }).catch((error: unknown) => error);
    await observeServerState(store, CONTEXT_ID, 2, tagB);
    sessionStore.set(b, {
      contextId: CONTEXT_ID,
      sessionTag: tagB,
      contextRevision: 2,
    });
    deny(new ApiError(401));
    expect(await pending).toMatchObject({ code: 'SUPERSEDED' });
    expect(
      mocked().mock.calls.filter(([path]) => path === '/me/password'),
    ).toHaveLength(1);
    expect(sessionStore.get()).toBe(b);
  });
  for (const stage of ['provision', 'confirm', 'reserve'] as const) {
    for (const code of [
      'CAPACITY_EXHAUSTED',
      'CONTEXT_UNAVAILABLE',
      'BINDING_INVALID',
    ]) {
      for (const newer of [false, true]) {
        it(`${stage} ${code} recovery is scoped to ${newer ? 'the stale attempt, preserving B' : 'the current attempt'}`, async () => {
          const store =
            stage === 'reserve'
              ? await installSelectedSelector()
              : installSelector();
          let deny!: (error: unknown) => void;
          const target =
            stage === 'provision'
              ? '/auth/contexts'
              : `/auth/contexts/${CONTEXT_ID}/${stage === 'confirm' ? 'confirm' : 'intents'}`;
          mocked().mockImplementation((path: string) => {
            if (path === target)
              return new Promise((_resolve, reject) => {
                deny = reject;
              });
            if (path === '/auth/contexts')
              return Promise.resolve({ contextId: CONTEXT_ID });
            throw new Error('unexpected request');
          });
          const pending = (
            stage === 'reserve'
              ? reserveIntent(store, 'LOCAL_LOGIN')
              : ensureContext(store)
          ).catch((error: unknown) => error);
          await vi.waitFor(() => expect(deny).toBeTypeOf('function'));
          const tagB = 'BBBBBBBBBBBBBBBBBBBBBB';
          const b = protocolSession(base, {
            sessionTag: tagB,
            contextRevision: 3,
          });
          if (newer) {
            const attempt = await beginProvisioning(store);
            await commitSelected(store, attempt.attemptId, CONTEXT_ID, 3, tagB);
            sessionStore.set(b, {
              contextId: CONTEXT_ID,
              sessionTag: tagB,
              contextRevision: 3,
            });
          }
          deny(new ApiError(409, code));
          expect(await pending).toMatchObject({
            reason: newer ? 'SUPERSEDED' : 'RECOVERY_REQUIRED',
          });
          expect(await readSelector(store)).toMatchObject(
            newer
              ? { state: 'SELECTED', sessionTag: tagB, revision: 3 }
              : {
                  state: 'RECOVERY_REQUIRED',
                  sessionTag: null,
                  recoveryReason:
                    code === 'CAPACITY_EXHAUSTED'
                      ? 'CAPACITY_EXHAUSTED'
                      : 'CONTEXT_UNAVAILABLE',
                },
          );
          if (newer) expect(sessionStore.get()).toBe(b);
        });
      }
    }
  }

  it('refresh queue expires at 5s without dispatch and reports NOT_DISPATCHED', async () => {
    vi.useFakeTimers();
    try {
      const store = await installSelectedSelector();
      await acquireRefreshLease(store, 'peer');
      let settled = false;
      let outcome: unknown;
      const flight = bootstrapSession(true)
        .catch((error) => error)
        .then((result) => {
          settled = true;
          outcome = result;
        });
      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      expect(outcome).toMatchObject({
        knowledge: 'NOT_DISPATCHED',
        code: 'QUEUE_TIMEOUT',
      });
      expect(iamRequest).not.toHaveBeenCalled();
      await flight;
    } finally {
      await vi.advanceTimersByTimeAsync(25000);
      vi.useRealTimers();
    }
  });

  for (const change of ['newer B', 'pending LOGOUT'] as const) {
    it(`queued refresh never returns cached A after ${change}`, async () => {
      vi.useFakeTimers();
      try {
        const store = await installSelectedSelector();
        const a = protocolSession(base);
        sessionStore.set(a, {
          contextId: CONTEXT_ID,
          sessionTag: TAG,
          contextRevision: 1,
        });
        await acquireRefreshLease(store, 'peer');
        let outcome: unknown;
        const flight = bootstrapSession(true)
          .catch((error) => error)
          .then((result) => {
            outcome = result;
          });
        await vi.advanceTimersByTimeAsync(0);
        if (change === 'newer B')
          await observeServerState(
            store,
            CONTEXT_ID,
            3,
            'BBBBBBBBBBBBBBBBBBBBBB',
          );
        else await beginIntent(store, 'LOGOUT');
        await vi.advanceTimersByTimeAsync(1000);
        expect(outcome).not.toBe(a);
        expect(sessionStore.get()).toBeNull();
        expect(iamRequest).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(5000);
        await flight;
      } finally {
        await vi.advanceTimersByTimeAsync(25000);
        vi.useRealTimers();
      }
    });
  }

  it('queued refresh returns a peer session only after selector validation', async () => {
    vi.useFakeTimers();
    try {
      const store = await installSelectedSelector();
      await acquireRefreshLease(store, 'peer');
      const flight = bootstrapSession(true);
      await vi.advanceTimersByTimeAsync(0);
      const b = protocolSession(base, {
        sessionTag: 'BBBBBBBBBBBBBBBBBBBBBB',
        contextRevision: 3,
      });
      await observeServerState(store, CONTEXT_ID, 3, b.sessionTag!);
      sessionStore.set(b, {
        contextId: CONTEXT_ID,
        sessionTag: b.sessionTag!,
        contextRevision: 3,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await flight).toBe(b);
      expect(iamRequest).not.toHaveBeenCalled();
    } finally {
      await vi.advanceTimersByTimeAsync(25000);
      vi.useRealTimers();
    }
  });
  it('a deferred queue selector read cannot replace a newly admitted peer B with cached A', async () => {
    vi.useFakeTimers();
    try {
      const store = await installSelectedSelector();
      const a = protocolSession(base);
      sessionStore.set(a, {
        contextId: CONTEXT_ID,
        sessionTag: TAG,
        contextRevision: 1,
      });
      await acquireRefreshLease(store, 'peer');
      const flight = bootstrapSession(true);
      await vi.advanceTimersByTimeAsync(0);
      let release!: () => void;
      let started!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reading = new Promise<void>((resolve) => {
        started = resolve;
      });
      const original = store.transact.bind(store);
      vi.spyOn(store, 'transact').mockImplementationOnce(async (work) => {
        const result = await original(work);
        started();
        await barrier;
        return result;
      });
      const tick = vi.advanceTimersByTimeAsync(1000);
      await reading;
      const b = protocolSession(base, {
        sessionTag: 'BBBBBBBBBBBBBBBBBBBBBB',
        contextRevision: 3,
      });
      await observeServerState(store, CONTEXT_ID, 3, b.sessionTag!);
      sessionStore.set(b, {
        contextId: CONTEXT_ID,
        sessionTag: b.sessionTag!,
        contextRevision: 3,
      });
      release();
      await tick;
      expect(sessionStore.get()).toBe(b);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await flight).toBe(b);
      expect(iamRequest).not.toHaveBeenCalled();
    } finally {
      await vi.advanceTimersByTimeAsync(25000);
      vi.useRealTimers();
    }
  });
});

describe('006 delayed selector delivery fences', () => {
  it('does not restore peer A when B is admitted before selector result delivery', async () => {
    const store = await installSelectedSelector();
    const a = protocolSession(base);
    const b = protocolSession(base, {
      sessionTag: 'B'.repeat(22),
      contextRevision: 2,
      accessToken: 'access-b',
    });
    const original = store.transact.bind(store);
    vi.spyOn(store, 'transact').mockImplementationOnce(async (work) => {
      const result = await original(work);
      await observeServerState(store, CONTEXT_ID, 2, b.sessionTag!);
      sessionStore.set(b, {
        contextId: CONTEXT_ID,
        sessionTag: b.sessionTag!,
        contextRevision: 2,
      });
      return result;
    });
    await acceptPeerSession({
      type: 'session',
      session: a,
      admission: { contextId: CONTEXT_ID, sessionTag: TAG, contextRevision: 1 },
    });
    expect(sessionStore.get()).toBe(b);
    expect((await readSelector(store)).sessionTag).toBe(b.sessionTag);
  });

  for (const code of [
    'CAPACITY_EXHAUSTED',
    'CREDENTIAL_MISSING',
    'CONTEXT_UNAVAILABLE',
    'BINDING_INVALID',
  ]) {
    it(`preserves B after delayed ${code} recovery result`, async () => {
      const store = await installSelectedSelector();
      sessionStore.set(protocolSession(base));
      const b = protocolSession(base, {
        sessionTag: 'B'.repeat(22),
        contextRevision: 2,
      });
      const original = store.transact.bind(store);
      vi.spyOn(store, 'transact').mockImplementation(async (work) => {
        let recovery = false;
        const result = await original((record) => {
          const outcome = work(record);
          recovery = outcome.next?.state === 'RECOVERY_REQUIRED';
          return outcome;
        });
        if (recovery) {
          const attempt = await beginProvisioning(store);
          await commitSelected(
            store,
            attempt.attemptId,
            CONTEXT_ID,
            2,
            b.sessionTag,
          );
          sessionStore.set(b);
        }
        return result;
      });
      mocked().mockRejectedValue(new ApiError(409, code));
      await expect(reserveIntent(store, 'LOCAL_LOGIN')).rejects.toThrow();
      expect(sessionStore.get()).toBe(b);
      expect((await readSelector(store)).state).toBe('SELECTED');
    });
  }

  for (const knowledge of ['NOT_DISPATCHED', 'UNCERTAIN'] as const) {
    it(`does not claim missing credential for ${knowledge} refresh`, async () => {
      await installSelectedSelector();
      sessionStore.set(protocolSession(base));
      mocked().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', knowledge));
      await expect(bootstrapSession(true)).resolves.toBeNull();
      expect(sessionStore.lastEndReason()).not.toBe('CREDENTIAL_MISSING');
      expect(sessionStore.get()).toBeNull();
    });
  }
});

for (const operation of ['logout', 'logout-all'] as const) {
  it(`reactively explains uncertain ${operation} on an already mounted notice and clears it for B`, async () => {
    await installSelectedSelector();
    const a = protocolSession(base);
    sessionStore.set(a, {
      contextId: CONTEXT_ID,
      sessionTag: TAG,
      contextRevision: 1,
    });
    render(<AuthRecoveryNotice />);
    routeProtocol(mocked(), () =>
      Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'UNCERTAIN')),
    );
    await act(async () => {
      await (operation === 'logout' ? logoutCurrent() : logoutAll());
    });
    expect(sessionStore.get()).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chưa xác nhận được kết quả trên máy chủ',
    );
    act(() =>
      sessionStore.set(protocolSession(base, { sessionTag: 'B'.repeat(22) })),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
}

for (const flow of ['login', 'refresh'] as const) {
  it(`preserves B when ${flow} CAS commits before delayed result delivery`, async () => {
    const store = await installSelectedSelector();
    sessionStore.set(protocolSession(base));
    const c = protocolSession(base, {
      sessionTag: 'C'.repeat(22),
      contextRevision: 2,
    });
    const b = protocolSession(base, {
      sessionTag: 'B'.repeat(22),
      contextRevision: 3,
    });
    const original = store.transact.bind(store);
    vi.spyOn(store, 'transact').mockImplementation(async (work) => {
      let committed = false;
      const result = await original((record) => {
        const outcome = work(record);
        committed = outcome.next?.sessionTag === c.sessionTag;
        return outcome;
      });
      if (committed) {
        await observeServerState(store, CONTEXT_ID, 3, b.sessionTag!);
        sessionStore.set(b);
      }
      return result;
    });
    routeProtocol(mocked(), (path) =>
      path === '/auth/csrf'
        ? Promise.resolve({ csrfToken: 'csrf' })
        : Promise.resolve(c),
    );
    if (flow === 'login')
      await expect(
        loginLocal('person@example.test', 'password'),
      ).rejects.toThrow();
    else await expect(bootstrapSession(true)).resolves.toBeNull();
    expect(sessionStore.get()).toBe(b);
    expect((await readSelector(store)).sessionTag).toBe(b.sessionTag);
  });
}

it('preserves B when an older reservation storage failure arrives late', async () => {
  const store = await installSelectedSelector();
  sessionStore.set(protocolSession(base));
  const b = protocolSession(base, {
    sessionTag: 'B'.repeat(22),
    contextRevision: 2,
  });
  vi.spyOn(store, 'transact').mockImplementationOnce(async () => {
    sessionStore.set(b);
    throw new SelectorStorageUnavailable();
  });
  await expect(reserveIntent(store, 'LOCAL_LOGIN')).rejects.toThrow(
    'STORAGE_UNAVAILABLE',
  );
  expect(sessionStore.get()).toBe(b);
});

for (const failure of ['timeout', 'lost', 'unreadable']) {
  it(`persists truthful ${failure} refresh uncertainty after dispatch without replay`, async () => {
    const store = await installSelectedSelector();
    sessionStore.set(protocolSession(base));
    mocked().mockImplementation((path: string) =>
      path === '/auth/csrf'
        ? Promise.resolve({ csrfToken: 'csrf' })
        : Promise.reject(new ApiError(0, failure, 'UNCERTAIN')),
    );
    await expect(bootstrapSession(true)).resolves.toBeNull();
    expect(sessionStore.lastEndReason()).toBe('OPERATION_UNCERTAIN');
    expect((await readSelector(store)).recoveryReason).toBe(
      'OPERATION_UNCERTAIN',
    );
    await bootstrapSession(true);
    expect(
      mocked().mock.calls.filter(([path]) => path === '/auth/refresh'),
    ).toHaveLength(1);
  });
}

for (const operation of ['logout', 'logout-all'] as const) {
  it(`reports confirmed ${operation} rejection separately from uncertainty`, async () => {
    await installSelectedSelector();
    sessionStore.set(protocolSession(base), {
      contextId: CONTEXT_ID,
      sessionTag: TAG,
      contextRevision: 1,
    });
    render(<AuthRecoveryNotice />);
    routeProtocol(mocked(), () =>
      Promise.reject(new ApiError(403, 'FORBIDDEN', 'COMPLETED')),
    );
    await act(async () => {
      await (operation === 'logout' ? logoutCurrent() : logoutAll());
    });
    expect(sessionStore.lastEndReason()).toBe('OPERATION_FAILED');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Máy chủ không hoàn tất thao tác',
    );
    expect(sessionStore.get()).toBeNull();
  });
}

it('refresh lease waits pass only the remaining queue budget to selector transactions', async () => {
  vi.useFakeTimers();
  try {
    const store = await installSelectedSelector();
    await acquireRefreshLease(store, 'other-tab');
    const budgets: Array<number | undefined> = [];
    setSelectorStoreForTests({
      transact: (work, budget) => {
        budgets.push(budget);
        return store.transact(work);
      },
      onClose: (listener) => store.onClose(listener),
    });
    const result = bootstrapSession(true);
    const rejected = expect(result).rejects.toMatchObject({
      code: 'QUEUE_TIMEOUT',
      knowledge: 'NOT_DISPATCHED',
    });
    await vi.advanceTimersByTimeAsync(5_001);
    await rejected;
    expect(budgets[0]).toBe(5_000);
    expect(
      budgets.every(
        (budget) => budget !== undefined && budget >= 0 && budget <= 5_000,
      ),
    ).toBe(true);
    // Expiry is checked before starting another read. The final bounded
    // transaction publishes feedback; it does not attempt lease acquisition.
    expect(budgets.at(-1)).toBe(5_000);
    expect(iamRequest).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it('a read-only committed logout receipt replaces uncertain feedback with confirmed revocation', async () => {
  await installSelectedSelector();
  sessionStore.set(protocolSession(base), {
    contextId: CONTEXT_ID,
    sessionTag: TAG,
    contextRevision: 1,
  });
  render(<AuthRecoveryNotice />);
  routeProtocol(mocked(), (path) =>
    path === '/auth/logout'
      ? Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'UNCERTAIN'))
      : Promise.resolve({
          authProtocol: 2,
          intentId: INTENT_ID,
          state: 'COMMITTED',
          outcomeCode: null,
          contextRevision: 1,
          currentSessionTag: null,
        }),
  );
  await act(async () => {
    await logoutCurrent();
  });
  expect(screen.getByRole('status')).toHaveTextContent(
    'Máy chủ đã xác nhận đăng xuất',
  );
  expect(screen.getByRole('status')).not.toHaveTextContent(
    'chưa được xác nhận',
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    mocked().mock.calls.filter(([path]) => path === '/auth/logout'),
  ).toHaveLength(1);
});

it('allows explicit login after bootstrap admission finishes during reservation setup', async () => {
  await installSelectedSelector();
  const renewed = protocolSession(base, { accessToken: 'renewed-a' });
  const selected = protocolSession(base, {
    sessionTag: 'C'.repeat(22),
    contextRevision: 2,
  });
  mocked().mockImplementation((path: string) => {
    if (path.endsWith('/intents')) {
      sessionStore.set(renewed);
      return Promise.resolve({ intentId: INTENT_ID, revision: 2 });
    }
    return Promise.resolve(selected);
  });
  await expect(loginLocal('person@example.test', 'password')).resolves.toBe(
    selected,
  );
  expect(sessionStore.get()).toBe(selected);
});

it('does not admit a peer session while a local login intent is pending', async () => {
  const store = await installSelectedSelector();
  const original = protocolSession(base);
  sessionStore.set(original);
  await beginIntent(store, 'LOCAL_LOGIN');
  await acceptPeerSession({
    type: 'session',
    session: protocolSession(base, { accessToken: 'peer-a' }),
    admission: { contextId: CONTEXT_ID, sessionTag: TAG, contextRevision: 1 },
  });
  expect(sessionStore.get()).toBe(original);
});

it('rejects a delayed peer snapshot after selector transition even before B admission', async () => {
  const store = await installSelectedSelector();
  const original = store.transact.bind(store);
  vi.spyOn(store, 'transact').mockImplementationOnce(async (work) => {
    const result = await original(work);
    await observeServerState(store, CONTEXT_ID, 2, 'B'.repeat(22));
    return result;
  });
  await acceptPeerSession({
    type: 'session',
    session: protocolSession(base),
    admission: { contextId: CONTEXT_ID, sessionTag: TAG, contextRevision: 1 },
  });
  expect(sessionStore.get()).toBeNull();
});

// Phase21: independent connections must not apply admission after their result is delivered.
for (const operation of ['peer', 'login', 'refresh'] as const) {
  it(`linearizes ${operation} admission inside the shared selector transaction across connections`, async () => {
    const shared = await installSelectedSelector();
    let connectionGeneration = 0;
    let inTransaction = false;
    let delayed = false;
    let selectedB = false;
    const admissions: Array<{ inTransaction: boolean; selectedB: boolean }> =
      [];
    const detach = sessionStore.subscribe(() => {
      if (sessionStore.get()) admissions.push({ inTransaction, selectedB });
    });
    setSelectorStoreForTests({
      generation: () => connectionGeneration,
      onClose: (listener) => shared.onClose(listener),
      transact: async (work) => {
        let resultAdmits = false;
        const result = await shared.transact((record) => {
          inTransaction = true;
          const before = sessionStore.version();
          try {
            const outcome = work(record);
            resultAdmits =
              sessionStore.version() !== before && !!sessionStore.get();
            if (outcome.next) connectionGeneration++;
            return outcome;
          } finally {
            inTransaction = false;
          }
        });
        // Delay only admission's read result, not reserve/lease/CAS transactions.
        if (resultAdmits && !delayed) {
          delayed = true;
          await observeServerState(shared, CONTEXT_ID, 2, 'B'.repeat(22));
          selectedB = true;
        }
        return result;
      },
    });
    mocked().mockImplementation((path: string) => {
      if (path.endsWith('/intents'))
        return Promise.resolve({ intentId: INTENT_ID, revision: 1 });
      if (path === '/auth/csrf') return Promise.resolve({ csrfToken: 'csrf' });
      return Promise.resolve(protocolSession(base));
    });
    try {
      if (operation === 'peer')
        await acceptPeerSession({
          type: 'session',
          session: protocolSession(base),
          admission: {
            contextId: CONTEXT_ID,
            sessionTag: TAG,
            contextRevision: 1,
          },
        });
      else if (operation === 'login')
        await loginLocal('person@example.test', 'password');
      else await bootstrapSession(true);
      expect(admissions).toEqual([{ inTransaction: true, selectedB: false }]);
      expect(delayed).toBe(true);
      expect((await readSelector(shared)).sessionTag).toBe('B'.repeat(22));
      // A peer hint ends an existing A admission; no delayed continuation restores it.
      await acceptPeerSession({ type: 'logout' });
      expect(sessionStore.get()).toBeNull();
    } finally {
      detach();
    }
  });
}

it('withdraws transaction-local admission if selector completion fails', async () => {
  const shared = await installSelectedSelector();
  setSelectorStoreForTests({
    onClose: (listener) => shared.onClose(listener),
    transact: async (work) => {
      await shared.transact(work);
      throw new SelectorStorageUnavailable();
    },
  });
  await acceptPeerSession({
    type: 'session',
    session: protocolSession(base),
    admission: { contextId: CONTEXT_ID, sessionTag: TAG, contextRevision: 1 },
  });
  expect(sessionStore.get()).toBeNull();
  expect(sessionStore.lastEndReason()).toBe('STORAGE_UNAVAILABLE');
});

for (const stage of ['provision', 'confirm', 'reserve'] as const) {
  for (const knowledge of [
    'NOT_DISPATCHED',
    'COMPLETED',
    'UNCERTAIN',
  ] as const) {
    it(`publishes persistent ${knowledge} feedback after ${stage} failure on a mounted notice`, async () => {
      const shared =
        stage === 'reserve'
          ? await installSelectedSelector()
          : installSelector();
      render(<AuthRecoveryNotice />);
      mocked().mockImplementation((path: string) => {
        const failing =
          stage === 'provision'
            ? path === '/auth/contexts'
            : stage === 'confirm'
              ? path.endsWith('/confirm')
              : path.endsWith('/intents');
        if (failing)
          return Promise.reject(
            new ApiError(
              knowledge === 'COMPLETED' ? 429 : 0,
              'TEST_FAILURE',
              knowledge,
            ),
          );
        return Promise.resolve({
          contextId: CONTEXT_ID,
          revision: 0,
          sessionTag: null,
        });
      });
      await act(async () => {
        await expect(
          stage === 'reserve'
            ? reserveIntent(shared, 'OAUTH')
            : ensureContext(shared),
        ).rejects.toThrow();
      });
      const expected =
        knowledge === 'UNCERTAIN'
          ? 'OPERATION_UNCERTAIN'
          : knowledge === 'NOT_DISPATCHED'
            ? 'NOT_DISPATCHED'
            : 'OPERATION_FAILED';
      expect(sessionStore.lastEndReason()).toBe(expected);
      expect((await readSelector(shared)).recoveryReason).toBe(expected);
      expect(screen.getByRole('alert')).toHaveTextContent(
        knowledge === 'UNCERTAIN'
          ? 'Chưa xác nhận được kết quả trên máy chủ'
          : knowledge === 'NOT_DISPATCHED'
            ? 'Không thể gửi yêu cầu'
            : 'Máy chủ không hoàn tất thao tác',
      );
      expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toBeVisible();
      expect(
        mocked().mock.calls.filter(([path]) => /\/intents\/[^/]+$/.test(path)),
      ).toHaveLength(0);
    });
  }
}

it('publishes lost logout reservation uncertainty without a fabricated receipt or replay', async () => {
  const shared = await installSelectedSelector();
  sessionStore.set(protocolSession(base), {
    contextId: CONTEXT_ID,
    sessionTag: TAG,
    contextRevision: 1,
  });
  render(<AuthRecoveryNotice />);
  mocked().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'UNCERTAIN'));
  await act(async () => {
    await logoutCurrent();
  });
  expect(sessionStore.get()).toBeNull();
  expect(sessionStore.lastEndReason()).toBe('OPERATION_UNCERTAIN');
  expect((await readSelector(shared)).pendingIntent?.intentId).toBeUndefined();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Chưa xác nhận được kết quả trên máy chủ',
  );
  expect(iamRequest).toHaveBeenCalledTimes(1);
});

it('queue expiry publishes persistent NOT_DISPATCHED feedback before explicit recovery', async () => {
  vi.useFakeTimers();
  try {
    const shared = await installSelectedSelector();
    await acquireRefreshLease(shared, 'other-tab');
    render(<AuthRecoveryNotice />);
    await act(async () => {
      const flight = bootstrapSession(true);
      const rejection = expect(flight).rejects.toMatchObject({
        code: 'QUEUE_TIMEOUT',
        knowledge: 'NOT_DISPATCHED',
      });
      await vi.advanceTimersByTimeAsync(5_001);
      await rejection;
    });
    expect(sessionStore.lastEndReason()).toBe('NOT_DISPATCHED');
    expect((await readSelector(shared)).recoveryReason).toBe('NOT_DISPATCHED');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không thể gửi yêu cầu',
    );
    expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toBeVisible();
    expect(iamRequest).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

for (const status of [403, 429, 500]) {
  it(`reports parsed ${status} refresh rejection as completed failure without replay`, async () => {
    const shared = await installSelectedSelector();
    render(<AuthRecoveryNotice />);
    mocked().mockImplementation((path: string) =>
      path === '/auth/csrf'
        ? Promise.resolve({ csrfToken: 'csrf' })
        : Promise.reject(
            new ApiError(status, 'CONFIRMED_REJECTION', 'COMPLETED'),
          ),
    );
    await act(async () => {
      await bootstrapSession(true);
    });
    expect(sessionStore.lastEndReason()).toBe('OPERATION_FAILED');
    expect((await readSelector(shared)).recoveryReason).toBe(
      'OPERATION_FAILED',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Máy chủ không hoàn tất thao tác',
    );
    await bootstrapSession(true);
    expect(
      mocked().mock.calls.filter(([path]) => path === '/auth/refresh'),
    ).toHaveLength(1);
  });
}

it('missing selector ends the held admission while rejecting a peer hint', async () => {
  installSelector();
  const a = protocolSession(base);
  sessionStore.set(a, {
    contextId: CONTEXT_ID,
    sessionTag: TAG,
    contextRevision: 1,
  });
  await acceptPeerSession({
    type: 'session',
    session: a,
    admission: { contextId: CONTEXT_ID, sessionTag: TAG, contextRevision: 1 },
  });
  expect(sessionStore.get()).toBeNull();
  expect(sessionStore.lastEndReason()).toBe('STORAGE_RESET');
  expect(iamRequest).not.toHaveBeenCalled();
});

// Phase22: observing shared invalidation must retire an already-held admission.
for (const transition of ['recovery', 'logout'] as const) {
  for (const newer of [false, true]) {
    it(`bootstrap observes ${transition} and ${newer ? 'preserves B after delayed invalidation delivery' : 'ends held A without dispatch'}`, async () => {
      const shared = await installSelectedSelector();
      const a = protocolSession(base);
      sessionStore.set(a, {
        contextId: CONTEXT_ID,
        sessionTag: TAG,
        contextRevision: 1,
      });
      if (transition === 'recovery')
        await requireRecovery(shared, 'CREDENTIAL_MISSING');
      else await beginIntent(shared, 'LOGOUT');
      const b = protocolSession(base, {
        sessionTag: 'B'.repeat(22),
        contextRevision: 2,
      });
      let endedInsideTransaction = false;
      let delayed = false;
      setSelectorStoreForTests({
        onClose: (listener) => shared.onClose(listener),
        transact: async (work) => {
          const result = await shared.transact((record) => {
            const outcome = work(record);
            if (sessionStore.get() === null) endedInsideTransaction = true;
            return outcome;
          });
          if (newer && endedInsideTransaction && !delayed) {
            delayed = true;
            const attempt = await beginProvisioning(shared);
            await commitSelected(
              shared,
              attempt.attemptId,
              CONTEXT_ID,
              2,
              b.sessionTag,
            );
            sessionStore.set(b, {
              contextId: CONTEXT_ID,
              sessionTag: b.sessionTag!,
              contextRevision: 2,
            });
          }
          return result;
        },
      });
      await bootstrapSession(true);
      expect(endedInsideTransaction).toBe(true);
      expect(iamRequest).not.toHaveBeenCalled();
      expect(sessionStore.get()).toBe(newer ? b : null);
      if (!newer)
        expect(sessionStore.lastEndReason()).toBe(
          transition === 'recovery' ? 'CREDENTIAL_MISSING' : 'LOGOUT',
        );
    });
  }
}

it('bootstrap preserves valid held admission with selected NOT_DISPATCHED feedback', async () => {
  const store = await installSelectedSelector();
  const a = protocolSession(base);
  sessionStore.set(a, {
    contextId: CONTEXT_ID,
    sessionTag: TAG,
    contextRevision: 1,
  });
  await store.transact((record) => ({
    next: { ...record!, recoveryReason: 'NOT_DISPATCHED' },
    result: undefined,
  }));
  await expect(bootstrapSession(true)).resolves.toBeNull();
  expect(sessionStore.get()).toBe(a);
  expect(iamRequest).not.toHaveBeenCalled();
});

for (const stage of ['confirm', 'refresh'] as const) {
  it(`OAuth result reports superseded and preserves B when B completes during ${stage}`, async () => {
    const store = await installSelectedSelector();
    const pending = await beginIntent(store, 'OAUTH');
    await store.transact((record) => ({
      next: {
        ...record!,
        pendingIntent: { ...record!.pendingIntent!, intentId: INTENT_ID },
      },
      result: undefined,
    }));
    window.history.replaceState(
      null,
      '',
      `/oauth-result?result=success&intent=${INTENT_ID}`,
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const b = protocolSession(base, {
      sessionTag: 'B'.repeat(22),
      contextRevision: 3,
    });
    mocked().mockImplementation(async (path: string) => {
      if (path.endsWith('/confirm')) {
        if (stage === 'confirm') {
          entered();
          await gate;
          return {
            authProtocol: 2,
            contextId: CONTEXT_ID,
            revision: 3,
            sessionTag: b.sessionTag,
          };
        }
        return {
          authProtocol: 2,
          contextId: CONTEXT_ID,
          revision: 2,
          sessionTag: TAG,
        };
      }
      if (path === '/auth/csrf') return { csrfToken: 'csrf' };
      if (path === '/auth/refresh') {
        entered();
        await gate;
        return protocolSession(base, { contextRevision: 2 });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    render(<OAuthResultPage />);
    await act(async () => {
      await started;
    });
    await beginIntent(store, 'LOCAL_LOGIN');
    await store.transact((record) => ({
      next: {
        ...record!,
        revision: 3,
        sessionTag: b.sessionTag!,
        pendingIntent: null,
      },
      result: undefined,
    }));
    sessionStore.set(b, {
      contextId: CONTEXT_ID,
      sessionTag: b.sessionTag!,
      contextRevision: 3,
    });
    await act(async () => {
      release();
      await gate;
    });
    expect(await screen.findByText(/đã được thay thế/)).toBeVisible();
    expect(screen.queryByText('Đăng nhập thành công.')).not.toBeInTheDocument();
    expect(sessionStore.get()).toBe(b);
    expect((await readSelector(store)).attemptId).not.toBe(pending.attemptId);
    if (stage === 'confirm')
      expect(
        mocked().mock.calls.filter(([path]) => path === '/auth/refresh'),
      ).toHaveLength(0);
  });
}

it('OAuth result completes the current intent after cookie-verified refresh', async () => {
  const store = await installSelectedSelector();
  await beginIntent(store, 'OAUTH');
  await store.transact((record) => ({
    next: {
      ...record!,
      pendingIntent: { ...record!.pendingIntent!, intentId: INTENT_ID },
    },
    result: undefined,
  }));
  window.history.replaceState(
    null,
    '',
    `/oauth-result?result=success&intent=${INTENT_ID}`,
  );
  mocked().mockImplementation(async (path: string) =>
    path.endsWith('/confirm')
      ? { authProtocol: 2, contextId: CONTEXT_ID, revision: 2, sessionTag: TAG }
      : path === '/auth/csrf'
        ? { csrfToken: 'csrf' }
        : protocolSession(base, { contextRevision: 2 }),
  );
  render(<OAuthResultPage />);
  expect(await screen.findByText('Đăng nhập thành công.')).toBeVisible();
  expect(sessionStore.get()?.sessionTag).toBe(TAG);
});

it('scoped OAuth bootstrap never dispatches refresh for a subsequently selected B', async () => {
  const store = await installSelectedSelector();
  const a = await beginIntent(store, 'OAUTH');
  await beginIntent(store, 'LOCAL_LOGIN');
  await store.transact((record) => ({
    next: {
      ...record!,
      sessionTag: 'B'.repeat(22),
      revision: 3,
      pendingIntent: null,
    },
    result: undefined,
  }));
  const b = protocolSession(base, {
    sessionTag: 'B'.repeat(22),
    contextRevision: 3,
  });
  sessionStore.set(b, {
    contextId: CONTEXT_ID,
    sessionTag: b.sessionTag!,
    contextRevision: 3,
  });
  // B's healthy renewal owns the lease; stale OAuth A must not wait out its queue and retire B.
  await acquireRefreshLease(store, 'peer-b');
  await expect(
    bootstrapSession(true, {
      contextId: CONTEXT_ID,
      attemptId: a.attemptId,
      sessionTag: TAG,
    }),
  ).resolves.toBeNull();
  expect(iamRequest).not.toHaveBeenCalled();
  expect(sessionStore.get()).toBe(b);
}, 10_000);

for (const held of [false, true]) {
  it(`login B atomically replaces its pending fence and preserves B against old refresh A with ${held ? 'held A' : 'no prior admission'}`, async () => {
    const shared = await installSelectedSelector();
    if (held)
      sessionStore.set(protocolSession(base), {
        contextId: CONTEXT_ID,
        sessionTag: TAG,
        contextRevision: 1,
      });
    let start!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let transactionAdmittedB = false;
    const b = protocolSession(base, {
      sessionTag: 'B'.repeat(22),
      contextRevision: 2,
      accessToken: 'access-b',
    });
    setSelectorStoreForTests({
      onClose: (listener) => shared.onClose(listener),
      transact: async (work) => {
        let clear = false;
        const result = await shared.transact((record) => {
          const outcome = work(record);
          clear =
            record?.pendingIntent?.kind === 'LOCAL_LOGIN' &&
            outcome.next?.pendingIntent === null;
          if (clear) transactionAdmittedB = sessionStore.get() === b;
          return outcome;
        });
        if (clear) {
          release();
          await oldRefresh;
        }
        return result;
      },
    });
    mocked().mockImplementation(async (path: string) => {
      if (path === '/auth/csrf') {
        start();
        await gate;
        return { csrfToken: 'csrf' };
      }
      if (path === '/auth/refresh')
        return protocolSession(base, { contextRevision: 2 });
      if (path.endsWith('/intents'))
        return { intentId: INTENT_ID, revision: 2 };
      if (path === '/auth/login') return b;
      throw new Error(`Unexpected request ${path}`);
    });
    const oldRefresh = bootstrapSession(true);
    await started;
    await expect(loginLocal('b@example.test', 'password')).resolves.toBe(b);
    expect(transactionAdmittedB).toBe(true);
    expect(sessionStore.get()).toBe(b);
    expect(await readSelector(shared)).toMatchObject({
      sessionTag: b.sessionTag,
      pendingIntent: null,
      revision: 2,
    });
  });
}

for (const malformed of ['slot tag', 'revision'] as const) {
  it(`atomic local login refuses malformed ${malformed} without private admission`, async () => {
    await installSelectedSelector();
    mocked().mockImplementation(async (path: string) =>
      path.endsWith('/intents')
        ? { intentId: INTENT_ID, revision: 2 }
        : protocolSession(
            base,
            malformed === 'slot tag'
              ? { sessionTag: undefined, contextRevision: 2 }
              : { contextRevision: Number.NaN },
          ),
    );
    await expect(
      loginLocal('b@example.test', 'password'),
    ).rejects.toMatchObject({ code: 'SUPERSEDED' });
    expect(sessionStore.get()).toBeNull();
    expect(sessionStore.admission()).toBeNull();
  });
}
