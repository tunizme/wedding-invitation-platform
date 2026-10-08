import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MemorySelectorStore,
  IndexedDbSelectorStore,
  acquireRefreshLease,
  beginIntent,
  beginProvisioning,
  commitSelected,
  endAdmissionReason,
  isCurrentAttempt,
  observeServerState,
  readSelector,
  requireRecovery,
  sanitizeRecord,
} from '../../src/features/identity-access/session/auth-selector';

const CONTEXT = '0f0e5a2c-6b1d-4c6a-9a51-2a4a0b6f9d10';
const OTHER = '1f0e5a2c-6b1d-4c6a-9a51-2a4a0b6f9d10';

describe('006 shared selector (logic via in-memory SelectorStore)', () => {
  it('treats a missing record as UNSELECTED', async () => {
    const store = new MemorySelectorStore();
    expect((await readSelector(store)).state).toBe('UNSELECTED');
  });

  it('commits SELECTED only when the provisioning attempt is still current', async () => {
    const store = new MemorySelectorStore();
    const first = await beginProvisioning(store);
    const second = await beginProvisioning(store); // newer explicit action
    expect(await isCurrentAttempt(store, first.attemptId)).toBe(false);
    expect(await commitSelected(store, first.attemptId, OTHER)).toBe(false);
    expect(await commitSelected(store, second.attemptId, CONTEXT)).toBe(true);
    const record = await readSelector(store);
    expect(record).toMatchObject({
      state: 'SELECTED',
      contextId: CONTEXT,
      revision: 0,
    });
  });

  it('a reset during verification makes the old attempt uncommittable', async () => {
    const store = new MemorySelectorStore();
    const attempt = await beginProvisioning(store);
    store.reset(); // user cleared site storage
    expect(await commitSelected(store, attempt.attemptId, CONTEXT)).toBe(false);
    expect((await readSelector(store)).state).toBe('UNSELECTED');
  });

  it('snapshots expectedRevision in the same transaction that creates the intent attempt', async () => {
    const store = new MemorySelectorStore();
    const attempt = await beginProvisioning(store);
    await commitSelected(store, attempt.attemptId, CONTEXT);
    await observeServerState(store, CONTEXT, 3, null);
    const intent = await beginIntent(store, 'LOCAL_LOGIN');
    expect(intent).toMatchObject({ contextId: CONTEXT, expectedRevision: 3 });
    const newer = await beginIntent(store, 'LOGOUT');
    expect(await isCurrentAttempt(store, intent.attemptId)).toBe(false);
    expect(await isCurrentAttempt(store, newer.attemptId)).toBe(true);
  });

  it('keeps revision monotonic (CAS max) and refuses stale server state', async () => {
    const store = new MemorySelectorStore();
    const attempt = await beginProvisioning(store);
    await commitSelected(store, attempt.attemptId, CONTEXT);
    expect(await observeServerState(store, CONTEXT, 5, 'A'.repeat(22))).toBe(
      true,
    );
    expect(await observeServerState(store, CONTEXT, 4, 'B'.repeat(22))).toBe(
      false,
    );
    expect(await readSelector(store)).toMatchObject({
      revision: 5,
      sessionTag: 'A'.repeat(22),
    });
    expect(await observeServerState(store, OTHER, 9, null)).toBe(false);
  });

  it('never persists secrets or unknown fields', () => {
    const record = sanitizeRecord({
      state: 'SELECTED',
      contextId: CONTEXT,
      revision: 1,
      accessToken: 'secret',
      csrfToken: 'secret',
      email: 'user@example.test',
    } as never);
    expect(Object.keys(record)).not.toEqual(
      expect.arrayContaining(['accessToken', 'csrfToken', 'email']),
    );
    expect(JSON.stringify(record)).not.toContain('secret');
  });

  it('serializes refresh through an expiring lease', async () => {
    const store = new MemorySelectorStore();
    expect(await acquireRefreshLease(store, 'a', 1_000)).toBe(true);
    expect(await acquireRefreshLease(store, 'b', 5_000)).toBe(false);
    expect(await acquireRefreshLease(store, 'b', 21_001)).toBe(true);
  });

  it('reports why a tab must end private admission', async () => {
    const store = new MemorySelectorStore();
    const attempt = await beginProvisioning(store);
    await commitSelected(store, attempt.attemptId, CONTEXT);
    await observeServerState(store, CONTEXT, 1, 'A'.repeat(22));
    const tab = { contextId: CONTEXT, sessionTag: 'A'.repeat(22) };
    expect(endAdmissionReason(await readSelector(store), tab)).toBeNull();
    await requireRecovery(store, 'CREDENTIAL_MISSING');
    expect(endAdmissionReason(await readSelector(store), tab)).toBe(
      'CREDENTIAL_MISSING',
    );
    store.reset();
    expect(endAdmissionReason(await readSelector(store), tab)).toBe(
      'STORAGE_RESET',
    );
  });
});

afterEach(() => vi.unstubAllGlobals());

it('versionchange invalidates a live connection before explicit close', async () => {
  const db = { onclose: null, onversionchange: null, close: vi.fn() };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = { result: db, onsuccess: null as null | (() => void) };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  const store = await IndexedDbSelectorStore.open();
  const ended = vi.fn();
  store.onClose(ended);
  (db.onversionchange as unknown as () => void)();
  expect(ended).toHaveBeenCalledOnce();
  expect(db.close).toHaveBeenCalledOnce();
});

for (const stage of ['read', 'commit', 'queued'] as const) {
  it(`bounds stalled ${stage} transactions and rejects late callbacks`, async () => {
    vi.useFakeTimers();
    try {
      const read = {
        result: undefined,
        onsuccess: null as null | (() => void),
      };
      const put = vi.fn();
      const tx = {
        objectStore: () => ({ get: () => read, put }),
        abort: vi.fn(),
        oncomplete: null as null | (() => void),
        onerror: null,
        onabort: null,
      };
      const db = {
        onclose: null,
        onversionchange: null,
        close: vi.fn(),
        transaction: () => tx,
      };
      vi.stubGlobal('indexedDB', {
        open: () => {
          const request = {
            result: db,
            onsuccess: null as null | (() => void),
          };
          Promise.resolve().then(() => request.onsuccess?.());
          return request;
        },
      });
      const store = await IndexedDbSelectorStore.open();
      const work = vi.fn(() => ({
        next: sanitizeRecord({ state: 'PROVISIONING' }),
        result: true,
      }));
      const result = store.transact(work);
      const rejected = expect(result).rejects.toThrow(
        'SELECTOR_STORAGE_UNAVAILABLE',
      );
      if (stage === 'commit') read.onsuccess?.();
      await vi.advanceTimersByTimeAsync(5_001);
      await rejected;
      const calls = put.mock.calls.length;
      read.onsuccess?.();
      tx.oncomplete?.();
      expect(put).toHaveBeenCalledTimes(calls);
      expect(work).toHaveBeenCalledTimes(stage === 'commit' ? 1 : 0);
      expect(tx.abort).toHaveBeenCalled();
      await expect(store.transact(work)).rejects.toThrow(
        'SELECTOR_STORAGE_UNAVAILABLE',
      );
    } finally {
      vi.useRealTimers();
    }
  });
}

it('a timed-out transaction does not re-notify an already invalidated connection', async () => {
  vi.useFakeTimers();
  try {
    const read = { onsuccess: null };
    const tx = {
      objectStore: () => ({ get: () => read }),
      abort: vi.fn(),
      oncomplete: null,
      onerror: null,
      onabort: null,
    };
    const db = {
      onclose: null,
      onversionchange: null,
      close: vi.fn(),
      transaction: () => tx,
    };
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request = { result: db, onsuccess: null as null | (() => void) };
        Promise.resolve().then(() => request.onsuccess?.());
        return request;
      },
    });
    const store = await IndexedDbSelectorStore.open();
    const ended = vi.fn();
    store.onClose(ended);
    const result = store.transact(() => ({ result: true }));
    const rejected = expect(result).rejects.toThrow(
      'SELECTOR_STORAGE_UNAVAILABLE',
    );
    (db.onversionchange as unknown as () => void)();
    expect(ended).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5_001);
    await rejected;
    expect(ended).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
