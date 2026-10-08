'use client';

import { ApiError, iamRequest, type AccessSession } from '../api/client';
import {
  acquireRefreshLease,
  clearPendingIntent,
  endAdmissionReason,
  observeServerState,
  readSelector,
  releaseRefreshLease,
  requireRecovery,
  selectorStore,
  SelectorStorageUnavailable,
  sanitizeRecord,
  type SelectorStore,
} from './auth-selector';
import {
  AuthFlowError,
  ensureContext,
  operationFailureReason,
  reserveIntent,
} from './auth-context-flow';
import { sessionStore, type Admission } from './store';

/**
 * 006 CSP-1 session coordination (research R12 F3/F4, browser-state §4–5).
 * - The shared selector decides the context; page load never provisions.
 * - Refresh is serialized across tabs by an IndexedDB lease (Web Locks optional).
 * - Peer messages are only hints: a peer session is adopted only if it matches
 *   the selector's context, session tag and revision.
 */

type RequestOptions = Parameters<typeof iamRequest>[1];
type SessionMessage =
  | { type: 'session'; session: AccessSession; admission: Admission }
  | { type: 'logout' };

const channel =
  typeof window === 'undefined' || typeof BroadcastChannel === 'undefined'
    ? undefined
    : new BroadcastChannel('wedding-auth-session');

const peerWaiters = new Set<() => void>();

export async function adoptIfCurrent(
  store: SelectorStore,
  session: AccessSession,
  admission: Admission,
  originVersion = sessionStore.version(),
  expectedAttemptId?: string,
  completePendingLogin = false,
): Promise<boolean> {
  const original = sessionStore.get();
  const heldAdmission = sessionStore.admission();
  const authorityGeneration = store.generation?.();
  let admittedVersion: number | undefined;
  try {
    const accepted = await store.transact((record) => {
      // The synchronous effect linearizes while this readwrite transaction
      // excludes every other connection's selector writer. Never apply it in
      // the promise continuation: another tab may commit before delivery.
      if (sessionStore.version() !== originVersion) return { result: false };
      if (heldAdmission && !record) {
        sessionStore.clearIf(original, 'STORAGE_RESET');
        return { result: false };
      }
      if (heldAdmission && record) {
        const reason = endAdmissionReason(record, heldAdmission);
        if (reason) sessionStore.clearIf(original, reason);
      }
      if (
        record?.state !== 'SELECTED' ||
        !/^[A-Za-z0-9_-]{22}$/.test(admission.sessionTag) ||
        !Number.isSafeInteger(admission.contextRevision) ||
        admission.contextRevision < 0 ||
        (expectedAttemptId !== undefined &&
          record.attemptId !== expectedAttemptId) ||
        record.contextId !== admission.contextId ||
        admission.contextRevision < record.revision ||
        (completePendingLogin
          ? !expectedAttemptId ||
            record.pendingIntent?.attemptId !== expectedAttemptId ||
            record.pendingIntent.kind !== 'LOCAL_LOGIN'
          : record.sessionTag !== admission.sessionTag ||
            record.pendingIntent !== null ||
            record.recoveryReason !== null)
      )
        return { result: false };
      sessionStore.set(session, admission);
      admittedVersion = sessionStore.version();
      // Local login's server result selects B, releases its pending fence and
      // admits B together. There is no pending-null/old-tag window for refresh A.
      return {
        next: completePendingLogin
          ? {
              ...record,
              sessionTag: admission.sessionTag,
              revision: admission.contextRevision,
              pendingIntent: null,
              recoveryReason: null,
            }
          : undefined,
        result: true,
      };
    });
    if (
      admittedVersion !== undefined &&
      sessionStore.version() !== admittedVersion
    )
      return false;
    // Same-connection invalidation is an eager hint for read-only adoption.
    // Completing login itself changes selector authority; that counter cannot
    // distinguish its own write from a peer. The effect above is transactional,
    // and provisional failure/local-version withdrawal remains identical.
    if (!completePendingLogin && store.generation?.() !== authorityGeneration) {
      if (sessionStore.version() === admittedVersion)
        sessionStore.clearIf(session, 'SUPERSEDED');
      return false;
    }
    return accepted;
  } catch (error) {
    // Admission is provisional until completion. Abort/timeout cannot retain it
    // or withdraw a newer session installed while the result was delayed.
    if (sessionStore.version() === admittedVersion)
      sessionStore.clearIf(session, 'STORAGE_UNAVAILABLE');
    throw error;
  }
}

export async function acceptPeerSession(message: SessionMessage) {
  if (message.type === 'session') {
    try {
      await adoptIfCurrent(
        await selectorStore(),
        message.session,
        message.admission,
      );
    } catch {
      // Storage unavailable: never adopt peer state.
    }
  } else {
    // Peer hints inspect authority only; they never rotate or restore a session.
    const originVersion = sessionStore.version();
    const original = sessionStore.get();
    try {
      await inspectAdmission(await selectorStore());
    } catch {
      if (sessionStore.version() === originVersion)
        sessionStore.clearIf(original, 'STORAGE_UNAVAILABLE');
    }
  }
  for (const wake of peerWaiters) wake();
  peerWaiters.clear();
}

channel?.addEventListener('message', (event: MessageEvent<SessionMessage>) => {
  if (event.data?.type === 'session' || event.data?.type === 'logout')
    void acceptPeerSession(event.data);
});

function publish(message: SessionMessage) {
  channel?.postMessage(message);
}

export function clearLocalSession(expected?: AccessSession | null): void {
  if (expected === undefined) sessionStore.clear('LOGOUT');
  else if (!sessionStore.clearIf(expected, 'LOGOUT')) return;
  publish({ type: 'logout' });
}

/** R06 queue wait is separate from the lifetime of an acquired refresh lease. */
export const REFRESH_QUEUE_MS = 5_000;

function waitForPeer(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      peerWaiters.delete(wake);
      resolve();
    }, ms);
    peerWaiters.add(wake);
  });
}

/** Explicit result pages may renew only the session of their originating intent. */
export interface RefreshScope {
  contextId: string;
  attemptId: string;
  sessionTag: string;
}

/** Observe and withdraw under the selector writer lock, never after delivery. */
async function inspectAdmission(store: SelectorStore, timeoutMs?: number) {
  const originVersion = sessionStore.version();
  const original = sessionStore.get();
  const heldAdmission = sessionStore.admission();
  return store.transact((selected) => {
    const current = selected ?? sanitizeRecord({});
    // Withdraw while the transaction excludes every selector writer, before
    // delivery of its result can race with a newer local admission.
    if (original && sessionStore.version() === originVersion) {
      const reason = heldAdmission
        ? endAdmissionReason(current, heldAdmission)
        : current.state !== 'SELECTED'
          ? (current.recoveryReason ?? 'STORAGE_RESET')
          : current.pendingIntent?.kind === 'LOGOUT'
            ? 'LOGOUT'
            : null;
      if (reason) sessionStore.clearIf(original, reason);
    }
    return { result: current };
  }, timeoutMs);
}

async function refreshOnce(
  store: SelectorStore,
  scope?: RefreshScope,
): Promise<AccessSession | null> {
  const originVersion = sessionStore.version();
  const original = sessionStore.get();
  const record = await inspectAdmission(store);
  if (
    scope &&
    (record.contextId !== scope.contextId ||
      record.attemptId !== scope.attemptId ||
      record.sessionTag !== scope.sessionTag)
  )
    return null;
  if (record.pendingIntent || record.recoveryReason) return null;
  if (record.state !== 'SELECTED' || !record.contextId || !record.sessionTag)
    return null;
  const auth = { contextId: record.contextId, sessionTag: record.sessionTag };
  const expected = { ...auth, revision: record.revision };
  const endOriginal = (reason: Parameters<typeof sessionStore.clear>[0]) => {
    if (sessionStore.version() !== originVersion) return;
    const current = sessionStore.get();
    if (current?.sessionTag === auth.sessionTag)
      sessionStore.clearIf(current, reason);
    else if (original) sessionStore.clearIf(original, reason);
    // A full navigation starts with no in-memory admission. Still publish the
    // recovery reason so the global notice can explain why bootstrap was denied.
    else if (!current && !sessionStore.admission()) sessionStore.clear(reason);
  };
  let refreshDispatched = false;
  try {
    const { csrfToken } = await iamRequest<{ csrfToken: string }>(
      '/auth/csrf',
      {
        cookieAuth: true,
        auth,
      },
    );
    refreshDispatched = true;
    const session = await iamRequest<AccessSession>('/auth/refresh', {
      method: 'POST',
      cookieAuth: true,
      csrfToken,
      auth,
      expectProtocol: true,
    });
    const admission: Admission = {
      contextId: record.contextId,
      sessionTag: session.sessionTag ?? '',
      contextRevision: session.contextRevision ?? 0,
    };
    if (
      !(await observeServerState(
        store,
        admission.contextId,
        admission.contextRevision,
        admission.sessionTag,
        auth.sessionTag,
        scope?.attemptId,
      ))
    ) {
      // A newer transition is known locally: never admit this result.
      endOriginal('SUPERSEDED');
      return null;
    }
    if (
      !(await adoptIfCurrent(
        store,
        session,
        admission,
        originVersion,
        scope?.attemptId,
      ))
    )
      return null;
    publish({ type: 'session', session, admission });
    return session;
  } catch (error) {
    // An error belongs to the original snapshot too: it cannot retire B.
    const stillCurrent = await store
      .transact((selected) => ({
        result:
          selected?.state === 'SELECTED' &&
          (!scope || selected.attemptId === scope.attemptId) &&
          selected.contextId === expected.contextId &&
          selected.sessionTag === expected.sessionTag &&
          selected.revision === expected.revision,
      }))
      .catch(() => false);
    if (!stillCurrent) return null;
    if (error instanceof ApiError && error.code === 'SUPERSEDED') {
      endOriginal('SUPERSEDED');
      return null;
    }
    const reason =
      error instanceof ApiError && error.code === 'CREDENTIAL_MISSING'
        ? 'CREDENTIAL_MISSING'
        : error instanceof ApiError &&
            (error.code === 'CONTEXT_UNAVAILABLE' ||
              error.code === 'BINDING_INVALID')
          ? 'CONTEXT_UNAVAILABLE'
          : !refreshDispatched ||
              (error instanceof ApiError &&
                error.knowledge === 'NOT_DISPATCHED')
            ? 'NOT_DISPATCHED'
            : operationFailureReason(error);
    if (await requireRecovery(store, reason, expected)) endOriginal(reason);
    return null;
  }
}

let refreshFlight: Promise<AccessSession | null> | undefined;

async function coordinatedRefresh(
  scope?: RefreshScope,
): Promise<AccessSession | null> {
  const originVersion = sessionStore.version();
  let store: SelectorStore;
  try {
    store = await selectorStore();
  } catch {
    if (sessionStore.version() === originVersion)
      sessionStore.clear('STORAGE_UNAVAILABLE');
    return null;
  }
  const attemptId = crypto.randomUUID();
  // A lease left by a closed/crashed tab expires after LEASE_MS; a refresh it
  // still had in flight can at worst trigger 003 reuse revocation (no grace).
  const deadline = Date.now() + REFRESH_QUEUE_MS;
  let queued: Awaited<ReturnType<typeof readSelector>> | undefined;
  let superseded = false;
  try {
    while (
      !(await acquireRefreshLease(
        store,
        attemptId,
        Date.now(),
        Math.max(0, deadline - Date.now()),
        (record) => {
          queued ??= record;
          superseded =
            !!scope &&
            (record.contextId !== scope.contextId ||
              record.attemptId !== scope.attemptId ||
              record.sessionTag !== scope.sessionTag);
        },
      ))
    ) {
      // An old result page never waits on B's lease or publishes B's queue failure.
      if (superseded) return null;
      if (Date.now() >= deadline)
        throw new ApiError(0, 'QUEUE_TIMEOUT', 'NOT_DISPATCHED');
      await waitForPeer(Math.min(1_000, deadline - Date.now()));
      if (Date.now() >= deadline)
        throw new ApiError(0, 'QUEUE_TIMEOUT', 'NOT_DISPATCHED');
      const cached = sessionStore.get();
      const admission = sessionStore.admission();
      // Never write a cached session back: B may arrive during this read.
      const selected = await inspectAdmission(
        store,
        Math.max(0, deadline - Date.now()),
      );
      if (cached && admission && !scope) {
        if (
          !endAdmissionReason(selected, admission) &&
          sessionStore.get() === cached &&
          admission.contextRevision >= selected.revision
        )
          return cached;
      }
      if (
        selected.state !== 'SELECTED' ||
        selected.pendingIntent?.kind === 'LOGOUT'
      )
        return null;
      if (Date.now() >= deadline)
        throw new ApiError(0, 'QUEUE_TIMEOUT', 'NOT_DISPATCHED');
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'QUEUE_TIMEOUT') {
      await store
        .transact((record) => {
          if (
            sessionStore.version() !== originVersion ||
            record?.state !== 'SELECTED' ||
            (scope &&
              (record.contextId !== scope.contextId ||
                record.attemptId !== scope.attemptId ||
                record.sessionTag !== scope.sessionTag)) ||
            !queued ||
            record.contextId !== queued.contextId ||
            record.sessionTag !== queued.sessionTag ||
            record.revision !== queued.revision ||
            record.attemptId !== queued.attemptId ||
            record.pendingIntent
          )
            return { result: undefined };
          sessionStore.clear('NOT_DISPATCHED');
          // Keep the lease/authority intact so a valid in-flight peer renewal
          // can still finish. A fresh explicit action clears this explanation.
          return {
            next: { ...record, recoveryReason: 'NOT_DISPATCHED' },
            result: undefined,
          };
        }, 5_000)
        .catch(() => undefined);
    }
    if (
      error instanceof SelectorStorageUnavailable &&
      sessionStore.version() === originVersion
    ) {
      sessionStore.clear('STORAGE_UNAVAILABLE');
      return null;
    }
    throw error;
  }
  // Best effort: a navigating/closing tab releases its lease so the next page
  // does not wait LEASE_MS (correctness never depends on this).
  const release = () =>
    void releaseRefreshLease(store, attemptId).catch(() => undefined);
  if (typeof window !== 'undefined')
    window.addEventListener('pagehide', release);
  try {
    return await refreshOnce(store, scope);
  } finally {
    if (typeof window !== 'undefined')
      window.removeEventListener('pagehide', release);
    await releaseRefreshLease(store, attemptId).catch(() => undefined);
  }
}

/** Restore or renew the private session for the selected context only. */
export function bootstrapSession(
  force = false,
  scope?: RefreshScope,
): Promise<AccessSession | null> {
  if (refreshFlight && !force && !scope) return refreshFlight;
  const flight = coordinatedRefresh(scope).finally(() => {
    if (refreshFlight === flight) refreshFlight = undefined;
  });
  refreshFlight = flight;
  return flight;
}

export async function authenticatedRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const current = sessionStore.get();
  const belongsToOrigin = (next: AccessSession | null) =>
    !current ||
    (next?.user.id === current.user.id &&
      (!current.sessionTag || next.sessionTag === current.sessionTag));
  try {
    return await iamRequest<T>(path, {
      ...options,
      accessToken: current?.accessToken,
    });
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      path === '/auth/refresh' ||
      path === '/auth/csrf'
    )
      throw error;
  }
  // A late 401 cannot replay a request (especially password mutation) under B.
  if (!belongsToOrigin(sessionStore.get()))
    throw new ApiError(409, 'SUPERSEDED');
  const refreshed = await bootstrapSession();
  if (!refreshed) throw new ApiError(401);
  if (!belongsToOrigin(refreshed)) throw new ApiError(409, 'SUPERSEDED');
  return iamRequest<T>(path, {
    ...options,
    accessToken: refreshed.accessToken,
  });
}

/**
 * F4: logout supersedes pending login in this context. Local private session
 * always ends (FR-010); if the remote outcome is unknown the selector keeps a
 * pending LOGOUT so no older session is auto-admitted later.
 */
export async function logoutCurrent(): Promise<void> {
  const current = sessionStore.get();
  const originatingAdmission = sessionStore.admission();
  clearLocalSession(current);
  const originVersion = sessionStore.version();
  try {
    const store = await selectorStore();
    const reserved = await reserveIntent(
      store,
      'LOGOUT',
      current?.sessionTag
        ? {
            contextId: originatingAdmission?.contextId,
            sessionTag: current.sessionTag,
          }
        : undefined,
    );
    publish({ type: 'logout' });
    await iamRequest('/auth/logout', {
      method: 'POST',
      cookieAuth: true,
      csrfToken: current?.csrfToken,
      auth: { contextId: reserved.contextId, intentId: reserved.intentId },
    });
    await clearPendingIntent(store, reserved.attemptId);
    await observeServerState(
      store,
      reserved.contextId,
      reserved.revision,
      null,
    );
  } catch (error) {
    // Recovery/supersession already has its own scoped explanation.
    if (!(error instanceof AuthFlowError)) {
      const record = await selectorStore()
        .then(readSelector)
        .catch(() => null);
      if (
        sessionStore.version() === originVersion &&
        record?.state === 'SELECTED' &&
        record.contextId === originatingAdmission?.contextId &&
        record.sessionTag === current?.sessionTag &&
        record.pendingIntent?.kind === 'LOGOUT'
      )
        sessionStore.clear(operationFailureReason(error));
    }
  } finally {
    clearLocalSession(current);
  }
}

/**
 * F1+F2: explicit local login. Provisions a context only for this explicit
 * action, reserves LOCAL_LOGIN with expected-revision CAS, executes with the
 * unchanged 003 body, then admits only if the selector still agrees.
 */
export async function loginLocal(
  email: string,
  password: string,
): Promise<AccessSession> {
  const store = await selectorStore();
  await ensureContext(store);
  const reserved = await reserveIntent(store, 'LOCAL_LOGIN');
  // Bootstrap may finish during setup. The attempt CAS fences setup; this
  // generation fences the credential request and its delayed selector results.
  const admissionVersion = sessionStore.version();
  let session: AccessSession;
  try {
    session = await iamRequest<AccessSession>('/auth/login', {
      method: 'POST',
      body: { email, password },
      cookieAuth: true,
      auth: { contextId: reserved.contextId, intentId: reserved.intentId },
      expectProtocol: true,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.knowledge !== 'UNCERTAIN')
      await clearPendingIntent(store, reserved.attemptId);
    else if (sessionStore.version() === admissionVersion)
      sessionStore.clear('OPERATION_UNCERTAIN');
    throw error;
  }
  const admission: Admission = {
    contextId: reserved.contextId,
    sessionTag: session.sessionTag ?? '',
    contextRevision: session.contextRevision ?? reserved.revision,
  };
  if (
    !(await adoptIfCurrent(
      store,
      session,
      admission,
      admissionVersion,
      reserved.attemptId,
      true,
    ))
  )
    throw new ApiError(409, 'SUPERSEDED');
  publish({ type: 'session', session, admission });
  return session;
}

export async function logoutAll(): Promise<void> {
  const current = sessionStore.get();
  const admission = sessionStore.admission();
  clearLocalSession(current);
  const originVersion = sessionStore.version();
  try {
    if (current)
      await iamRequest('/auth/logout-all', {
        method: 'POST',
        cookieAuth: true,
        accessToken: current.accessToken,
      });
  } catch (error) {
    let scoped = !admission;
    if (admission) {
      const store = await selectorStore().catch(() => null);
      if (store)
        scoped = await requireRecovery(store, operationFailureReason(error), {
          contextId: admission.contextId,
          sessionTag: admission.sessionTag,
          revision: admission.contextRevision,
        }).catch(() => false);
    }
    if (scoped && sessionStore.version() === originVersion)
      sessionStore.clear(operationFailureReason(error));
  } finally {
    clearLocalSession(current);
  }
}
