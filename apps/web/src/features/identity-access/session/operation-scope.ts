import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ApiError } from '../api/client';
import { sessionStore } from './store';

/** UI lifetime only:006 continues to own auth ordering/cookie admission. */
export interface OperationScope {
  readonly resource: string;
  readonly signal: AbortSignal;
  isActive(): boolean;
  assertActive(): void;
  dispose(): void;
  onDispose(cleanup: () => void): () => void;
}
export function createOperationScope(
  resource: string,
  owns: () => boolean = () => true,
): OperationScope {
  const epoch = sessionStore.identityEpoch();
  const principal = sessionStore.get();
  const controller = new AbortController();
  const cleanups = new Set<() => void>();
  const scope: OperationScope = {
    resource,
    signal: controller.signal,
    isActive: () =>
      !controller.signal.aborted &&
      owns() &&
      sessionStore.identityEpoch() === epoch &&
      (!principal || sessionStore.get() !== null),
    assertActive() {
      if (!this.isActive())
        throw new ApiError(409, 'SUPERSEDED', 'NOT_DISPATCHED');
    },
    dispose() {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    },
    onDispose(cleanup) {
      if (controller.signal.aborted) {
        cleanup();
        return () => {};
      }
      cleanups.add(cleanup);
      return () => {
        cleanups.delete(cleanup);
      };
    },
  };
  return scope;
}
export function combinedDeadline(signal?: AbortSignal, ms = 15000) {
  const controller = new AbortController();
  const forward = () => controller.abort();
  if (signal?.aborted) forward();
  else signal?.addEventListener('abort', forward, { once: true });
  const timer = setTimeout(forward, ms);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    },
  };
}
/** Owner key changes synchronously; token/profile renewal keeps mounted inputs. */
export function usePrivateOwner(resource: string, role?: 'CUSTOMER' | 'ADMIN') {
  const epoch = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.identityEpoch,
    () => 0,
  );
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  const authorized =
    !!session &&
    session.user.status === 'ACTIVE' &&
    (!role || session.user.role === role);
  return authorized
    ? `${epoch}:${session!.user.id}:${session!.user.role}:${session!.user.status}:${resource}`
    : null;
}
/** Capture once per operation, then retain it through all awaits/next steps.
 * Mount generations invalidate even StrictMode cleanup/setup continuations.
 */
export function useOperationLifetime(resource: string) {
  const epoch = sessionStore.identityEpoch();
  const lifecycle = useRef({ mounted: true, generation: 0 });
  const scopes = useRef(new Set<OperationScope>());
  useEffect(() => {
    const life = lifecycle.current;
    life.mounted = true;
    const active = scopes.current;
    const unsubscribe = sessionStore.subscribe(() => {
      if (sessionStore.identityEpoch() !== epoch)
        for (const scope of active) scope.dispose();
    });
    return () => {
      life.mounted = false;
      life.generation++;
      unsubscribe();
      for (const scope of active) scope.dispose();
      active.clear();
    };
  }, [epoch, resource]);
  return useMemo(
    () => ({
      capture() {
        const generation = lifecycle.current.generation;
        const scope = createOperationScope(
          resource,
          () =>
            lifecycle.current.mounted &&
            lifecycle.current.generation === generation &&
            sessionStore.identityEpoch() === epoch,
        );
        scopes.current.add(scope);
        scope.onDispose(() => scopes.current.delete(scope));
        return scope;
      },
      isActive: () =>
        lifecycle.current.mounted && sessionStore.identityEpoch() === epoch,
    }),
    [epoch, resource],
  );
}
export type OperationLifetime = ReturnType<typeof useOperationLifetime>;

export async function scopedDelay(ms: number, scope: OperationScope) {
  scope.assertActive();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      scope.signal.removeEventListener('abort', abort);
      reject(new ApiError(409, 'SUPERSEDED', 'NOT_DISPATCHED'));
    };
    const timer = setTimeout(() => {
      scope.signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    scope.signal.addEventListener('abort', abort, { once: true });
  });
  scope.assertActive();
}

/** Keeps cancellation/deadline effective even while an injected transport stalls. */
export async function withSignal<T>(
  action: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted)
    throw new ApiError(0, 'REQUEST_CANCELLED', 'NOT_DISPATCHED');
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        abort = () => reject(new ApiError(0, 'REQUEST_CANCELLED', 'UNCERTAIN'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
