/**
 * 006 shared selector (contracts/browser-state.md §3, data-model "Shared selector").
 *
 * Holds only opaque IDs, revisions and local timestamps: never email/profile,
 * tokens, CSRF, cookie values, proofs or passwords. Every change is a short
 * read-modify-write transaction; never await network inside one.
 */

export type SelectorState =
  'UNSELECTED' | 'PROVISIONING' | 'SELECTED' | 'RECOVERY_REQUIRED';
export type RecoveryReason =
  | 'STORAGE_RESET'
  | 'STORAGE_UNAVAILABLE'
  | 'CREDENTIAL_MISSING'
  | 'CAPACITY_EXHAUSTED'
  | 'CONTEXT_UNAVAILABLE'
  | 'OPERATION_FAILED'
  | 'OPERATION_UNCERTAIN'
  | 'NOT_DISPATCHED';
export type EndAdmissionReason =
  RecoveryReason | 'STORAGE_UNAVAILABLE' | 'SUPERSEDED' | 'LOGOUT';
export type IntentKind =
  'LOCAL_LOGIN' | 'OAUTH' | 'ONBOARDING_COMPLETE' | 'LOGOUT';

export interface PendingIntent {
  attemptId: string;
  kind: IntentKind;
  expectedRevision: number;
  intentId?: string;
}

export interface SelectorRecord {
  state: SelectorState;
  attemptId: string | null;
  attemptSeq: number;
  attemptAt: number | null;
  contextId: string | null;
  revision: number;
  sessionTag: string | null;
  pendingIntent: PendingIntent | null;
  refreshLease: { attemptId: string; at: number } | null;
  recoveryReason: RecoveryReason | null;
}

export const LEASE_MS = 20_000;
const UUID = /^[0-9a-f-]{36}$/;
const TAG = /^[A-Za-z0-9_-]{22}$/;

const EMPTY: SelectorRecord = {
  state: 'UNSELECTED',
  attemptId: null,
  attemptSeq: 0,
  attemptAt: null,
  contextId: null,
  revision: 0,
  sessionTag: null,
  pendingIntent: null,
  refreshLease: null,
  recoveryReason: null,
};

/** Whitelists fields and shapes; anything else is dropped before persisting. */
export function sanitizeRecord(input: Partial<SelectorRecord>): SelectorRecord {
  const states: SelectorState[] = [
    'UNSELECTED',
    'PROVISIONING',
    'SELECTED',
    'RECOVERY_REQUIRED',
  ];
  const reasons: RecoveryReason[] = [
    'STORAGE_RESET',
    'STORAGE_UNAVAILABLE',
    'CREDENTIAL_MISSING',
    'CAPACITY_EXHAUSTED',
    'CONTEXT_UNAVAILABLE',
    'OPERATION_FAILED',
    'OPERATION_UNCERTAIN',
    'NOT_DISPATCHED',
  ];
  const kinds: IntentKind[] = [
    'LOCAL_LOGIN',
    'OAUTH',
    'ONBOARDING_COMPLETE',
    'LOGOUT',
  ];
  const id = (value: unknown) =>
    typeof value === 'string' && UUID.test(value) ? value : null;
  const count = (value: unknown) =>
    Number.isSafeInteger(value) && (value as number) >= 0
      ? (value as number)
      : 0;
  const pending = input.pendingIntent;
  const lease = input.refreshLease;
  return {
    state: states.includes(input.state as SelectorState)
      ? (input.state as SelectorState)
      : 'UNSELECTED',
    attemptId: id(input.attemptId),
    attemptSeq: count(input.attemptSeq),
    attemptAt: typeof input.attemptAt === 'number' ? input.attemptAt : null,
    contextId: id(input.contextId),
    revision: count(input.revision),
    sessionTag:
      typeof input.sessionTag === 'string' && TAG.test(input.sessionTag)
        ? input.sessionTag
        : null,
    pendingIntent:
      pending && id(pending.attemptId) && kinds.includes(pending.kind)
        ? {
            attemptId: pending.attemptId,
            kind: pending.kind,
            expectedRevision: count(pending.expectedRevision),
            ...(id(pending.intentId) ? { intentId: pending.intentId } : {}),
          }
        : null,
    refreshLease:
      lease &&
      typeof lease.attemptId === 'string' &&
      typeof lease.at === 'number'
        ? { attemptId: lease.attemptId.slice(0, 64), at: lease.at }
        : null,
    recoveryReason: reasons.includes(input.recoveryReason as RecoveryReason)
      ? (input.recoveryReason as RecoveryReason)
      : null,
  };
}

/** Local committed authority generation excludes advisory refresh-lease changes. */
function authorityKey(record: SelectorRecord | undefined) {
  return JSON.stringify(
    record
      ? [
          record.state,
          record.attemptId,
          record.contextId,
          record.revision,
          record.sessionTag,
          record.pendingIntent,
          record.recoveryReason,
        ]
      : null,
  );
}

/** One short transaction over the single selector record. */
export interface SelectorStore {
  generation?(): number;
  transact<T>(
    work: (record: SelectorRecord | undefined) => {
      next?: SelectorRecord;
      result: T;
    },
    timeoutMs?: number,
  ): Promise<T>;
  onClose(listener: () => void): () => void;
}

/** In-memory adapter with sequential transactions (tests and SSR guard). */
export class MemorySelectorStore implements SelectorStore {
  private record: SelectorRecord | undefined;
  private authorityGeneration = 0;
  generation = () => this.authorityGeneration;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly closeListeners = new Set<() => void>();

  transact<T>(
    work: (record: SelectorRecord | undefined) => {
      next?: SelectorRecord;
      result: T;
    },
  ): Promise<T> {
    const run = this.queue.then(() => {
      const { next, result } = work(
        this.record ? structuredClone(this.record) : undefined,
      );
      if (next) {
        const selected = sanitizeRecord(next);
        if (authorityKey(selected) !== authorityKey(this.record))
          this.authorityGeneration++;
        this.record = selected;
      }
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  onClose(listener: () => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  /** Simulates "clear site data": the record disappears and connections close. */
  reset() {
    this.authorityGeneration++;
    this.record = undefined;
    for (const listener of this.closeListeners) listener();
  }
}

const DB_NAME = 'wedding-auth';
const STORE = 'selector';
const KEY = 'current';

export class SelectorStorageUnavailable extends Error {
  constructor() {
    super('SELECTOR_STORAGE_UNAVAILABLE');
  }
}

/** IndexedDB adapter: readwrite transactions on one store serialize (A3). */
export class IndexedDbSelectorStore implements SelectorStore {
  private authorityGeneration = 0;
  generation = () => this.authorityGeneration;
  private closed = false;
  private readonly closeListeners = new Set<() => void>();

  private constructor(private readonly db: IDBDatabase) {
    const invalidate = () => {
      if (this.closed) return;
      this.closed = true;
      for (const listener of this.closeListeners) listener();
    };
    db.onclose = invalidate;
    // Explicit db.close() does not emit the unexpected-close event.
    db.onversionchange = () => {
      invalidate();
      db.close();
    };
  }

  static open(timeoutMs = 5_000): Promise<IndexedDbSelectorStore> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined')
        return reject(new SelectorStorageUnavailable());
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new SelectorStorageUnavailable());
      }, timeoutMs);
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, 1);
      } catch {
        clearTimeout(timer);
        return reject(new SelectorStorageUnavailable());
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) return request.result.close();
        resolve(new IndexedDbSelectorStore(request.result));
      };
      request.onerror = request.onblocked = () => {
        clearTimeout(timer);
        if (!settled) reject(new SelectorStorageUnavailable());
        settled = true;
      };
    });
  }

  transact<T>(
    work: (record: SelectorRecord | undefined) => {
      next?: SelectorRecord;
      result: T;
    },
    timeoutMs = 5_000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.closed || timeoutMs <= 0)
        return reject(new SelectorStorageUnavailable());
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(STORE, 'readwrite');
      } catch {
        return reject(new SelectorStorageUnavailable());
      }
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      };
      const timer = setTimeout(
        () => {
          // Invalidate before abort: late callbacks may never execute work or put.
          const alreadyClosed = this.closed;
          this.closed = true;
          finish(new SelectorStorageUnavailable());
          try {
            tx.abort();
          } catch {
            /* Already completed or aborted. */
          }
          this.db.close();
          // A versionchange may already have ended this connection's admission.
          // Its old timeout must not invalidate a subsequently reopened session.
          if (!alreadyClosed)
            for (const listener of this.closeListeners) listener();
        },
        Math.max(0, timeoutMs),
      );
      const objects = tx.objectStore(STORE);
      const read = objects.get(KEY);
      let result: T;
      let authorityChanged = false;
      read.onsuccess = () => {
        if (settled || this.closed) return;
        try {
          const record = read.result
            ? sanitizeRecord(read.result as SelectorRecord)
            : undefined;
          const outcome = work(record);
          authorityChanged =
            !!outcome.next &&
            authorityKey(sanitizeRecord(outcome.next)) !== authorityKey(record);
          result = outcome.result;
          if (outcome.next) objects.put(sanitizeRecord(outcome.next), KEY);
        } catch (error) {
          finish(error);
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        if (!settled && !this.closed && authorityChanged)
          this.authorityGeneration++;
        finish(this.closed ? new SelectorStorageUnavailable() : undefined);
      };
      tx.onerror = tx.onabort = () => finish(new SelectorStorageUnavailable());
    });
  }

  onClose(listener: () => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
}

const newId = () => crypto.randomUUID();

export function readSelector(
  store: SelectorStore,
  timeoutMs?: number,
): Promise<SelectorRecord> {
  return store.transact(
    (record) => ({ result: record ?? { ...EMPTY } }),
    timeoutMs,
  );
}

/** F1 step 1: explicit auth action reserves a provisioning attempt. */
export function beginProvisioning(
  store: SelectorStore,
  now = Date.now(),
): Promise<{ attemptId: string; attemptSeq: number }> {
  return store.transact((record) => {
    const base = record ?? EMPTY;
    const attemptId = newId();
    const attemptSeq = base.attemptSeq + 1;
    return {
      next: {
        ...EMPTY,
        attemptSeq,
        state: 'PROVISIONING',
        attemptId,
        attemptAt: now,
      },
      result: { attemptId, attemptSeq },
    };
  });
}

export function isCurrentAttempt(
  store: SelectorStore,
  attemptId: string,
): Promise<boolean> {
  return store.transact((record) => ({
    result: record?.attemptId === attemptId,
  }));
}

/** F1 step 4: conditional commit after network verification. */
export function commitSelected(
  store: SelectorStore,
  attemptId: string,
  contextId: string,
  revision = 0,
  sessionTag: string | null = null,
): Promise<boolean> {
  return store.transact((record) => {
    if (
      !record ||
      record.state !== 'PROVISIONING' ||
      record.attemptId !== attemptId
    )
      return { result: false };
    return {
      next: {
        ...record,
        state: 'SELECTED',
        contextId,
        revision,
        sessionTag,
        recoveryReason: null,
      },
      result: true,
    };
  });
}

/** F2 step 1: new local attempt with expectedRevision snapshot (same tx). */
export function beginIntent(
  store: SelectorStore,
  kind: IntentKind,
  now = Date.now(),
  expected?: { contextId?: string; sessionTag: string },
): Promise<{
  attemptId: string;
  contextId: string;
  expectedRevision: number;
  sessionTag: string | null;
}> {
  return store.transact((record) => {
    if (!record || record.state !== 'SELECTED' || !record.contextId)
      throw new Error('SELECTOR_NOT_SELECTED');
    if (
      expected &&
      (record.sessionTag !== expected.sessionTag ||
        (expected.contextId && record.contextId !== expected.contextId))
    )
      throw new Error('SUPERSEDED');
    const attemptId = newId();
    return {
      next: {
        ...record,
        attemptId,
        attemptSeq: record.attemptSeq + 1,
        attemptAt: now,
        recoveryReason: null,
        pendingIntent: { attemptId, kind, expectedRevision: record.revision },
      },
      result: {
        attemptId,
        contextId: record.contextId,
        expectedRevision: record.revision,
        sessionTag: record.sessionTag,
      },
    };
  });
}

/** Records the server-accepted intent if the attempt is still current. */
export function markIntentReserved(
  store: SelectorStore,
  attemptId: string,
  intentId: string,
  revision: number,
): Promise<boolean> {
  return store.transact((record) => {
    if (!record || record.pendingIntent?.attemptId !== attemptId)
      return { result: false };
    return {
      next: {
        ...record,
        revision: Math.max(record.revision, revision),
        pendingIntent: {
          ...record.pendingIntent,
          intentId,
          expectedRevision: revision,
        },
      },
      result: true,
    };
  });
}

export function clearPendingIntent(
  store: SelectorStore,
  attemptId: string,
): Promise<void> {
  return store.transact((record) =>
    record?.pendingIntent?.attemptId === attemptId
      ? { next: { ...record, pendingIntent: null }, result: undefined }
      : { result: undefined },
  );
}

/** CAS max on revision; returns false for another context or a stale revision. */
export function observeServerState(
  store: SelectorStore,
  contextId: string,
  revision: number,
  sessionTag: string | null,
  expectedSessionTag?: string,
  expectedAttemptId?: string,
): Promise<boolean> {
  return store.transact((record) => {
    if (
      !record ||
      record.state !== 'SELECTED' ||
      record.contextId !== contextId ||
      (expectedAttemptId !== undefined &&
        record.attemptId !== expectedAttemptId) ||
      (expectedSessionTag !== undefined &&
        (record.sessionTag !== expectedSessionTag ||
          record.pendingIntent !== null)) ||
      (sessionTag !== null && record.pendingIntent?.kind === 'LOGOUT')
    )
      return { result: false };
    if (revision < record.revision) return { result: false };
    return {
      next: { ...record, revision, sessionTag, recoveryReason: null },
      result: true,
    };
  });
}

export function requireRecovery(
  store: SelectorStore,
  reason: RecoveryReason,
  expected?:
    | { contextId: string; sessionTag: string; revision: number }
    | { attemptId: string; contextId?: string },
): Promise<boolean> {
  return store.transact((record) => {
    if (expected && 'attemptId' in expected) {
      if (
        !record ||
        record.attemptId !== expected.attemptId ||
        (expected.contextId !== undefined &&
          record.contextId !== expected.contextId)
      )
        return { result: false };
    } else if (
      expected &&
      (!record ||
        record.state !== 'SELECTED' ||
        record.contextId !== expected.contextId ||
        record.sessionTag !== expected.sessionTag ||
        record.revision !== expected.revision)
    )
      return { result: false };
    return {
      next: {
        ...(record ?? EMPTY),
        state: 'RECOVERY_REQUIRED',
        sessionTag: null,
        pendingIntent: null,
        refreshLease: null,
        recoveryReason: reason,
      },
      result: true,
    };
  });
}

export function acquireRefreshLease(
  store: SelectorStore,
  attemptId: string,
  now = Date.now(),
  timeoutMs?: number,
  inspect?: (record: SelectorRecord) => void,
): Promise<boolean> {
  return store.transact((record) => {
    const base = record ?? EMPTY;
    inspect?.(base);
    const lease = base.refreshLease;
    if (lease && lease.attemptId !== attemptId && now - lease.at <= LEASE_MS)
      return { result: false };
    return {
      next: { ...base, refreshLease: { attemptId, at: now } },
      result: true,
    };
  }, timeoutMs);
}

export function releaseRefreshLease(
  store: SelectorStore,
  attemptId: string,
): Promise<void> {
  return store.transact((record) =>
    record?.refreshLease?.attemptId === attemptId
      ? { next: { ...record, refreshLease: null }, result: undefined }
      : { result: undefined },
  );
}

/** Why a tab holding {contextId, sessionTag} must stop showing private state. */
export function endAdmissionReason(
  record: SelectorRecord,
  tab: { contextId: string; sessionTag: string | null },
): EndAdmissionReason | null {
  if (record.state === 'UNSELECTED' || record.state === 'PROVISIONING')
    return 'STORAGE_RESET';
  if (record.state === 'RECOVERY_REQUIRED')
    return record.recoveryReason ?? 'STORAGE_RESET';
  if (record.contextId !== tab.contextId) return 'STORAGE_RESET';
  if (record.sessionTag !== tab.sessionTag) return 'SUPERSEDED';
  if (record.pendingIntent?.kind === 'LOGOUT') return 'LOGOUT';
  return null;
}

let shared: Promise<SelectorStore> | undefined;
const storageCloseListeners = new Set<() => void>();

/** Remains subscribed across explicit recovery reopening the adapter. */
export function onSelectorStorageClose(listener: () => void): () => void {
  storageCloseListeners.add(listener);
  return () => {
    storageCloseListeners.delete(listener);
  };
}

function trackConnection(store: SelectorStore): SelectorStore {
  store.onClose(() => {
    shared = undefined;
    for (const listener of storageCloseListeners) listener();
  });
  return store;
}

/** Test seam: install a store (or `null` to simulate unavailable storage). */
export function setSelectorStoreForTests(store: SelectorStore | null) {
  shared =
    store === null
      ? Promise.reject(new SelectorStorageUnavailable())
      : Promise.resolve(trackConnection(store));
  shared.catch(() => undefined);
}
/** Process-wide selector store; rejects with SelectorStorageUnavailable. */
export function selectorStore(): Promise<SelectorStore> {
  shared ??= IndexedDbSelectorStore.open()
    .then(trackConnection)
    .catch((error) => {
      shared = undefined;
      throw error;
    });
  return shared;
}
