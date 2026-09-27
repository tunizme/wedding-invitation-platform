'use client';

import { ApiError, iamRequest, type AccessSession } from '../api/client';
import { sessionStore } from './store';

type RequestOptions = Parameters<typeof iamRequest>[1];
type SessionMessage =
  { type: 'session'; session: AccessSession } | { type: 'logout' };

const channel =
  typeof window === 'undefined' || typeof BroadcastChannel === 'undefined'
    ? undefined
    : new BroadcastChannel('wedding-auth-session');

const peerWaiters = new Set<(session: AccessSession | null) => void>();

export function acceptPeerSession(message: SessionMessage) {
  const session = message.type === 'session' ? message.session : null;
  if (session) sessionStore.set(session);
  else sessionStore.clear();
  for (const resolve of peerWaiters) resolve(session);
  peerWaiters.clear();
}

channel?.addEventListener('message', (event: MessageEvent<SessionMessage>) => {
  if (event.data?.type === 'session' || event.data?.type === 'logout')
    acceptPeerSession(event.data);
});

let refreshFlight: Promise<AccessSession | null> | undefined;

function publish(message: SessionMessage) {
  channel?.postMessage(message);
}

export function clearLocalSession(): void {
  sessionStore.clear();
  publish({ type: 'logout' });
}

async function performRefresh(): Promise<AccessSession | null> {
  try {
    const { csrfToken } = await iamRequest<{ csrfToken: string }>(
      '/auth/csrf',
      { cookieAuth: true },
    );
    const session = await iamRequest<AccessSession>('/auth/refresh', {
      method: 'POST',
      cookieAuth: true,
      csrfToken,
    });
    sessionStore.set(session);
    publish({ type: 'session', session });
    return session;
  } catch {
    sessionStore.clear();
    publish({ type: 'logout' });
    return null;
  }
}

function waitForPeer(): Promise<AccessSession | null> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      peerWaiters.delete(done);
      resolve(null);
    }, 15_000);
    const done = (session: AccessSession | null) => {
      window.clearTimeout(timeout);
      resolve(session);
    };
    peerWaiters.add(done);
  });
}

export function bootstrapSession(): Promise<AccessSession | null> {
  if (refreshFlight) return refreshFlight;
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  const work = locks
    ? locks
        .request<Promise<AccessSession | null>>(
          'wedding-auth-refresh',
          { mode: 'exclusive', ifAvailable: true },
          (lock) => (lock ? performRefresh() : waitForPeer()),
        )
        .then((session) => session)
    : performRefresh();
  const flight = work.finally(() => {
    refreshFlight = undefined;
  });
  refreshFlight = flight;
  return flight;
}

export async function authenticatedRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const current = sessionStore.get();
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
  const refreshed = await bootstrapSession();
  if (!refreshed) throw new ApiError(401);
  return iamRequest<T>(path, {
    ...options,
    accessToken: refreshed.accessToken,
  });
}

export async function logoutCurrent(): Promise<void> {
  const current = sessionStore.get();
  try {
    await iamRequest('/auth/logout', {
      method: 'POST',
      cookieAuth: true,
      csrfToken: current?.csrfToken,
    });
  } catch {
    // Local logout is authoritative when the network cannot be reached.
  } finally {
    clearLocalSession();
  }
}

export async function logoutAll(): Promise<void> {
  const current = sessionStore.get();
  try {
    if (current)
      await iamRequest('/auth/logout-all', {
        method: 'POST',
        cookieAuth: true,
        accessToken: current.accessToken,
      });
  } catch {
    // The browser session still ends even if aggregate server revocation cannot be reached.
  } finally {
    clearLocalSession();
  }
}
