import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '../../src/features/identity-access/session/store';
import {
  createOperationScope,
  combinedDeadline,
} from '../../src/features/identity-access/session/operation-scope';
import { ApiError } from '../../src/features/identity-access/api/client';
import { authenticatedRequest } from '../../src/features/identity-access/session/refresh-coordinator';
import { privateSession } from './private-session-fixture';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: request,
}));
const a = privateSession();
beforeEach(() => {
  sessionStore.clear();
  sessionStore.set(a);
  request.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  sessionStore.clear();
});
describe('captured private operation scopes', () => {
  it('keeps same-owner renewal but permanently invalidates A to B to A', () => {
    const epoch = sessionStore.identityEpoch();
    const scope = createOperationScope('resource');
    sessionStore.set({
      ...a,
      accessToken: 'renewed',
      user: { ...a.user, displayName: 'renewed' },
    });
    expect(sessionStore.identityEpoch()).toBe(epoch);
    expect(scope.isActive()).toBe(true);
    sessionStore.set({ ...a, user: { ...a.user, id: 'B' } });
    sessionStore.set(a);
    expect(scope.isActive()).toBe(false);
    expect(() => scope.assertActive()).toThrow();
    scope.dispose();
  });
  it('invalidates null role status context and session-tag transitions', () => {
    for (const change of [
      null,
      { ...a, user: { ...a.user, role: 'ADMIN' as const } },
      { ...a, user: { ...a.user, status: 'LOCKED' as const } },
      { ...a, sessionTag: 'BBBBBBBBBBBBBBBBBBBBBB' },
    ]) {
      sessionStore.set(a);
      const scope = createOperationScope('resource');
      if (change) sessionStore.set(change);
      else sessionStore.clear();
      expect(scope.isActive()).toBe(false);
      scope.dispose();
    }
  });
  it('runs cleanup exactly once and cancels pending work on disposal', () => {
    const scope = createOperationScope('resource');
    const cleanup = vi.fn();
    scope.onDispose(cleanup);
    scope.dispose();
    scope.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(scope.signal.aborted).toBe(true);
  });
  it('caller cancellation does not replace the timeout deadline', () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const deadline = combinedDeadline(controller.signal, 100);
    vi.advanceTimersByTime(100);
    expect(deadline.signal.aborted).toBe(true);
    deadline.dispose();
  });
  it('never returns a success parsed after the identity changed', async () => {
    let resolve!: (v: unknown) => void;
    request.mockImplementation(() => new Promise((done) => (resolve = done)));
    const pending = authenticatedRequest('/me');
    sessionStore.set({ ...a, user: { ...a.user, id: 'B' } });
    resolve({ displayName: 'private A' });
    await expect(pending).rejects.toMatchObject({ code: 'SUPERSEDED' });
  });
  it('suppresses stale failures and rejects a previously captured scope before dispatch', async () => {
    const scope = createOperationScope('resource');
    sessionStore.set({ ...a, user: { ...a.user, id: 'B' } });
    await expect(authenticatedRequest('/me', { scope })).rejects.toMatchObject({
      code: 'SUPERSEDED',
    });
    expect(request).not.toHaveBeenCalled();
    scope.dispose();
  });
  it('rejects the caller at once but still delivers a cookie-writing request after the owner ends', async () => {
    let resolve!: (v: unknown) => void;
    let fetchSignal: AbortSignal | undefined;
    request.mockImplementation(
      (_path: string, options: { signal?: AbortSignal }) => {
        fetchSignal = options.signal;
        return new Promise((done) => (resolve = done));
      },
    );
    const scope = createOperationScope('ProfileForm');
    const pending = authenticatedRequest('/me/password', {
      method: 'POST',
      cookieAuth: true,
      scope,
    });
    sessionStore.set({ ...a, user: { ...a.user, id: 'B' } });
    scope.dispose();
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    expect(fetchSignal?.aborted).toBe(false);
    resolve(undefined);
  });
  it('aborts a non-cookie request when the owner ends', async () => {
    let fetchSignal: AbortSignal | undefined;
    request.mockImplementation(
      (_path: string, options: { signal?: AbortSignal }) => {
        fetchSignal = options.signal;
        return new Promise(() => {});
      },
    );
    const scope = createOperationScope('ProfileForm');
    const pending = authenticatedRequest('/me', { scope });
    sessionStore.set({ ...a, user: { ...a.user, id: 'B' } });
    scope.dispose();
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    expect(fetchSignal?.aborted).toBe(true);
  });
  it('does not bootstrap a stale anonymous authenticated operation into B', async () => {
    sessionStore.clear();
    request.mockRejectedValue(new ApiError(401));
    await expect(authenticatedRequest('/me')).rejects.toMatchObject({
      status: 401,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
