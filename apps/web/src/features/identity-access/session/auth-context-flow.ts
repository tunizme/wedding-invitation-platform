import { ApiError, iamRequest } from '../api/client';
import {
  beginIntent,
  beginProvisioning,
  clearPendingIntent,
  commitSelected,
  isCurrentAttempt,
  markIntentReserved,
  readSelector,
  requireRecovery,
  SelectorStorageUnavailable,
  type IntentKind,
  type SelectorStore,
  type RecoveryReason,
} from './auth-selector';
import { sessionStore } from './store';

/**
 * 006 client flows (research R12 F1/F2, contracts/browser-state.md §3).
 * Only explicit user actions call these; page load never provisions.
 */

export class AuthFlowError extends Error {
  constructor(
    readonly reason:
      | 'SUPERSEDED'
      | 'RECOVERY_REQUIRED'
      | 'UNCERTAIN'
      | 'STALE_EXHAUSTED'
      | 'STORAGE_UNAVAILABLE',
    readonly cause?: unknown,
  ) {
    super(reason);
  }
}

const RESERVE_RETRIES = 2;

/** One mapping for parsed failure versus uncertainty, used at every setup stage. */
export function operationFailureReason(error: unknown): RecoveryReason {
  if (error instanceof ApiError) {
    if (error.knowledge === 'NOT_DISPATCHED') return 'NOT_DISPATCHED';
    if (error.knowledge === 'COMPLETED') return 'OPERATION_FAILED';
  }
  return 'OPERATION_UNCERTAIN';
}

export function authFlowMessage(error: unknown): string | undefined {
  if (error instanceof AuthFlowError && error.reason === 'UNCERTAIN')
    return 'Chưa xác nhận được kết quả trên máy chủ. Vui lòng kiểm tra trạng thái trước khi bắt đầu thao tác mới.';
  if (error instanceof AuthFlowError && error.reason === 'STORAGE_UNAVAILABLE')
    return 'Không thể xác nhận phiên đăng nhập trong trình duyệt này.';
  return undefined;
}

function storageFailure(error: unknown, originVersion: number): never {
  if (error instanceof SelectorStorageUnavailable) {
    if (sessionStore.version() === originVersion)
      sessionStore.clear('STORAGE_UNAVAILABLE');
    throw new AuthFlowError('STORAGE_UNAVAILABLE', error);
  }
  throw error;
}

async function recoverFrom(
  store: SelectorStore,
  error: unknown,
  expected: { attemptId: string; contextId?: string },
  originVersion: number,
): Promise<never> {
  if (
    !(await isCurrentAttempt(store, expected.attemptId).catch((error) =>
      storageFailure(error, originVersion),
    ))
  )
    throw new AuthFlowError('SUPERSEDED', error);
  if (error instanceof ApiError) {
    if (error.code === 'CAPACITY_EXHAUSTED') {
      if (
        !(await requireRecovery(store, 'CAPACITY_EXHAUSTED', expected).catch(
          (error) => storageFailure(error, originVersion),
        ))
      )
        throw new AuthFlowError('SUPERSEDED', error);
      if (sessionStore.version() === originVersion)
        sessionStore.clear('CAPACITY_EXHAUSTED');
      throw new AuthFlowError('RECOVERY_REQUIRED', error);
    }
    if (
      error.code === 'CREDENTIAL_MISSING' ||
      error.code === 'CONTEXT_UNAVAILABLE' ||
      error.code === 'BINDING_INVALID'
    ) {
      const reason =
        error.code === 'CREDENTIAL_MISSING'
          ? 'CREDENTIAL_MISSING'
          : 'CONTEXT_UNAVAILABLE';
      if (
        !(await requireRecovery(store, reason, expected).catch((error) =>
          storageFailure(error, originVersion),
        ))
      )
        throw new AuthFlowError('SUPERSEDED', error);
      if (sessionStore.version() === originVersion) sessionStore.clear(reason);
      throw new AuthFlowError('RECOVERY_REQUIRED', error);
    }
    const reason = operationFailureReason(error);
    const recorded = await store
      .transact((record) => {
        if (
          !record ||
          record.attemptId !== expected.attemptId ||
          (expected.contextId !== undefined &&
            record.contextId !== expected.contextId)
        )
          return { result: false };
        // Publish while this attempt is still the shared owner. Keep unresolved
        // routing metadata (including an absent intent ID) for read-only recovery.
        if (sessionStore.version() === originVersion)
          sessionStore.clear(reason);
        return { next: { ...record, recoveryReason: reason }, result: true };
      })
      .catch((error) => storageFailure(error, originVersion));
    if (!recorded) throw new AuthFlowError('SUPERSEDED', error);
    if (error.knowledge === 'UNCERTAIN')
      throw new AuthFlowError('UNCERTAIN', error);
  }
  throw error;
}

/** F1: return the selected context, provisioning one for an explicit action. */
export async function ensureContext(
  store: SelectorStore,
): Promise<{ contextId: string; revision: number }> {
  const originVersion = sessionStore.version();
  const current = await readSelector(store).catch((error) =>
    storageFailure(error, originVersion),
  );
  if (current.state === 'SELECTED' && current.contextId)
    return { contextId: current.contextId, revision: current.revision };
  let attempt: Awaited<ReturnType<typeof beginProvisioning>>;
  try {
    attempt = await beginProvisioning(store);
  } catch (error) {
    if (error instanceof SelectorStorageUnavailable) {
      if (sessionStore.version() === originVersion)
        sessionStore.clear('STORAGE_UNAVAILABLE');
      throw new AuthFlowError('STORAGE_UNAVAILABLE', error);
    }
    throw error;
  }
  let contextId: string;
  try {
    ({ contextId } = await iamRequest<{ contextId: string }>('/auth/contexts', {
      method: 'POST',
      body: {},
      cookieAuth: true,
      expectProtocol: true,
    }));
  } catch (error) {
    return recoverFrom(store, error, attempt, originVersion);
  }
  // Superseded attempts never confirm or touch the selector.
  if (!(await isCurrentAttempt(store, attempt.attemptId)))
    throw new AuthFlowError('SUPERSEDED');
  let confirmed: { revision: number; sessionTag: string | null };
  try {
    confirmed = await iamRequest(`/auth/contexts/${contextId}/confirm`, {
      method: 'POST',
      body: {},
      cookieAuth: true,
      auth: { contextId },
      expectProtocol: true,
    });
  } catch (error) {
    return recoverFrom(store, error, attempt, originVersion);
  }
  // Network verification and IndexedDB commit are not atomic: re-check.
  if (
    !(await commitSelected(
      store,
      attempt.attemptId,
      contextId,
      confirmed.revision,
      confirmed.sessionTag,
    ))
  )
    throw new AuthFlowError('SUPERSEDED');
  return { contextId, revision: confirmed.revision };
}

export interface ReservedAttempt {
  attemptId: string;
  contextId: string;
  intentId: string;
  revision: number;
}

/** F2: reserve with expected-revision CAS; retry STALE only while still current. */
export async function reserveIntent(
  store: SelectorStore,
  kind: IntentKind,
  expected?: { contextId?: string; sessionTag: string },
): Promise<ReservedAttempt> {
  const originVersion = sessionStore.version();
  let attempt: Awaited<ReturnType<typeof beginIntent>>;
  try {
    attempt = await beginIntent(store, kind, Date.now(), expected);
  } catch (error) {
    if (error instanceof SelectorStorageUnavailable) {
      if (sessionStore.version() === originVersion)
        sessionStore.clear('STORAGE_UNAVAILABLE');
      throw new AuthFlowError('STORAGE_UNAVAILABLE', error);
    }
    throw error;
  }
  let expectedRevision = attempt.expectedRevision;
  for (let tries = 0; ; tries++) {
    try {
      const reserved = await iamRequest<{ intentId: string; revision: number }>(
        `/auth/contexts/${attempt.contextId}/intents`,
        {
          method: 'POST',
          cookieAuth: true,
          auth: { contextId: attempt.contextId },
          body: {
            kind,
            expectedRevision,
            ...(kind === 'LOGOUT'
              ? { expectedSessionTag: attempt.sessionTag }
              : {}),
          },
          expectProtocol: true,
        },
      );
      if (
        !(await markIntentReserved(
          store,
          attempt.attemptId,
          reserved.intentId,
          reserved.revision,
        ))
      )
        throw new AuthFlowError('SUPERSEDED');
      return {
        attemptId: attempt.attemptId,
        contextId: attempt.contextId,
        intentId: reserved.intentId,
        revision: reserved.revision,
      };
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'STALE_REVISION' &&
        error.currentRevision !== undefined
      ) {
        if (!(await isCurrentAttempt(store, attempt.attemptId)))
          throw new AuthFlowError('SUPERSEDED', error);
        if (tries >= RESERVE_RETRIES) {
          await clearPendingIntent(store, attempt.attemptId);
          throw new AuthFlowError('STALE_EXHAUSTED', error);
        }
        expectedRevision = error.currentRevision;
        continue;
      }
      if (error instanceof AuthFlowError) throw error;
      return recoverFrom(store, error, attempt, originVersion);
    }
  }
}
