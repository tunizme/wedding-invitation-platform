import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  loadProductionSession,
  type ProductionSessionRealm,
} from './support/production-session';
import type { DeliveryProxy } from './support/delivery-proxy';
import { expect, test } from './support/fixtures';
import {
  startProxy,
  loginViaUi,
  openLogin,
  principalAfterReload,
  seedUser,
  stackReady,
  submitLogin,
} from './support/stack';

/**
 * 006 T011 (real IndexedDB): selector contents, unavailable storage and reset.
 * Logic-level CAS/re-check is covered by tests/identity-access/auth-selector.test.ts.
 */
test.skip(!stackReady, 'Requires the owned stack (AUTH_TRANSITION_WITH_WEB=1)');

let proxy: DeliveryProxy;
test.beforeAll(async () => {
  proxy = await startProxy();
});
test.afterAll(async () => proxy?.close());

async function selectorRecord(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown> | null>((resolve) => {
        const open = indexedDB.open('wedding-auth', 1);
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction('selector', 'readonly')
            .objectStore('selector')
            .get('current');
          read.onsuccess = () => {
            db.close();
            resolve((read.result as Record<string, unknown>) ?? null);
          };
          read.onerror = () => resolve(null);
        };
        open.onerror = () => resolve(null);
      }),
  );
}

test('the persisted selector holds only opaque routing metadata', async ({
  page,
}) => {
  const email = await seedUser('idb');
  await loginViaUi(page, email);
  const record = await selectorRecord(page);
  expect(record).toMatchObject({ state: 'SELECTED' });
  const serialized = JSON.stringify(record);
  expect(serialized).not.toContain(email);
  // Field names are whitelisted below; values must never carry secrets.
  expect(serialized).not.toMatch(/accessToken|csrf|password|Bearer/i);
  expect(Object.keys(record ?? {}).sort()).toEqual(
    [
      'attemptAt',
      'attemptId',
      'attemptSeq',
      'contextId',
      'pendingIntent',
      'recoveryReason',
      'refreshLease',
      'revision',
      'sessionTag',
      'state',
    ].sort(),
  );
});

test('unavailable IndexedDB keeps public UI and never admits a session', async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get: () => undefined,
    });
  });
  const email = await seedUser('idb-off');
  await openLogin(page);
  await submitLogin(page, email);
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    /Không thể xác nhận phiên đăng nhập trong trình duyệt này/,
  );
  expect(await principalAfterReload(page)).toBeNull();
});

test('a cleared selector ends admission; surviving cookies never restore the account', async ({
  context,
  page,
}) => {
  const email = await seedUser('idb-reset');
  await loginViaUi(page, email);
  expect(await principalAfterReload(page)).toBe(email);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('wedding-auth');
        request.onsuccess =
          request.onerror =
          request.onblocked =
            () => resolve();
      }),
  );
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toHaveCount(0);
  expect((await context.cookies()).length).toBeGreaterThan(0);
  await submitLogin(page, email);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  expect(await principalAfterReload(page)).toBe(email);
});

test('two tabs serialize real IndexedDB attempts and reject stale attempt/revision commits', async ({
  context,
  page,
}) => {
  const email = await seedUser('idb-cas');
  await loginViaUi(page, email);
  const other = await context.newPage();
  await openLogin(other);
  const initial = await selectorRecord(page);
  // Execute the production adapter in each real browser realm, using its own
  // IndexedDB connection. Transpilation only removes TypeScript annotations.
  const source = ts.transpileModule(
    readFileSync(
      'src/features/identity-access/session/auth-selector.ts',
      'utf8',
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  for (const target of [page, other]) {
    await target.evaluate(async (source) => {
      const url = URL.createObjectURL(
        new Blob([source], { type: 'text/javascript' }),
      );
      const api = await import(/* webpackIgnore: true */ url);
      URL.revokeObjectURL(url);
      Object.assign(window, {
        selectorTestApi: api,
        selectorTestStore: await api.IndexedDbSelectorStore.open(),
      });
    }, source);
  }
  const advance = (target: import('@playwright/test').Page) =>
    target.evaluate(async () => {
      const realm = window as typeof window & {
        selectorTestApi: typeof import('../../src/features/identity-access/session/auth-selector');
        selectorTestStore: import('../../src/features/identity-access/session/auth-selector').SelectorStore;
      };
      return realm.selectorTestApi.beginIntent(
        realm.selectorTestStore,
        'LOCAL_LOGIN',
      );
    });
  const attempts = await Promise.all([advance(page), advance(other)]);
  expect(attempts.every(Boolean)).toBe(true);
  const final = await selectorRecord(page);
  expect(final?.attemptSeq).toBe(Number(initial?.attemptSeq) + 2);
  const stale = attempts.find(
    (attempt) => attempt?.attemptId !== final?.attemptId,
  )!;
  const committed = await page.evaluate(async (attempt) => {
    const realm = window as typeof window & {
      selectorTestApi: typeof import('../../src/features/identity-access/session/auth-selector');
      selectorTestStore: import('../../src/features/identity-access/session/auth-selector').SelectorStore;
    };
    const rejectedAttempt = await realm.selectorTestApi.markIntentReserved(
      realm.selectorTestStore,
      attempt.attemptId,
      'stale-intent',
      attempt.expectedRevision + 1,
    );
    const accepted = await realm.selectorTestApi.markIntentReserved(
      realm.selectorTestStore,
      (await realm.selectorTestApi.readSelector(realm.selectorTestStore))
        .attemptId!,
      'current-intent',
      attempt.expectedRevision + 2,
    );
    const rejectedRevision = await realm.selectorTestApi.observeServerState(
      realm.selectorTestStore,
      attempt.contextId,
      attempt.expectedRevision,
      'stale-session',
    );
    return { rejectedAttempt, accepted, rejectedRevision };
  }, stale);
  expect(committed).toEqual({
    rejectedAttempt: false,
    accepted: true,
    rejectedRevision: false,
  });
  expect((await selectorRecord(other))?.revision).toBe(
    stale.expectedRevision + 2,
  );
});

test('Phase20: a real queued IndexedDB transaction expires without late selector writes', async ({
  page,
}) => {
  await openLogin(page);
  const source = ts.transpileModule(
    readFileSync(
      'src/features/identity-access/session/auth-selector.ts',
      'utf8',
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  const result = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(
      new Blob([source], { type: 'text/javascript' }),
    );
    const api = await import(/* webpackIgnore: true */ url);
    URL.revokeObjectURL(url);
    const store = await api.IndexedDbSelectorStore.open();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('wedding-auth', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    let release = false;
    const blocker = db.transaction('selector', 'readwrite');
    const objects = blocker.objectStore('selector');
    const pump = () => {
      const read = objects.get('current');
      read.onsuccess = () => {
        if (!release) pump();
      };
    };
    pump();
    let calls = 0;
    const start = performance.now();
    let rejected = false;
    try {
      await store.transact((record: Record<string, unknown>) => {
        calls++;
        return { next: { ...record, state: 'PROVISIONING' }, result: true };
      }, 250);
    } catch {
      rejected = true;
    }
    const elapsed = performance.now() - start;
    release = true;
    await new Promise<void>((resolve) => {
      blocker.oncomplete = () => resolve();
      blocker.onabort = () => resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    db.close();
    return { rejected, calls, elapsed };
  }, source);
  expect(result.rejected).toBe(true);
  expect(result.calls).toBe(0);
  expect(result.elapsed).toBeGreaterThanOrEqual(200);
  expect(result.elapsed).toBeLessThan(3_000);
});

test('Phase21: delayed admission result across real connections never restores A after B and renews B', async ({
  page,
  context,
}) => {
  const a = await seedUser('phase21-admission-a');
  const b = await seedUser('phase21-admission-b');
  await loginViaUi(page, a);
  await loadProductionSession(page);
  await page.evaluate(async () => {
    const realm = window as ProductionSessionRealm & {
      admissionGate?: {
        reached: boolean;
        release: () => void;
        flight: Promise<void>;
        effects: boolean[];
        selectedB: boolean;
      };
    };
    const {
      coordinator,
      selector,
      store: { sessionStore },
    } = realm.productionSession;
    const current = await coordinator.bootstrapSession(true);
    if (!current || !sessionStore.admission())
      throw new Error('Missing A admission');
    const admission = sessionStore.admission()!;
    sessionStore.clear();
    const connection = await selector.IndexedDbSelectorStore.open();
    const original = connection.transact.bind(connection);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const state = {
      reached: false,
      release,
      flight: Promise.resolve(),
      effects: [] as boolean[],
      selectedB: false,
    };
    realm.admissionGate = state;
    sessionStore.subscribe(() => {
      if (sessionStore.get()) state.effects.push(state.selectedB);
    });
    connection.transact = async (work, budget) => {
      const result = await original(work, budget);
      if (!state.reached) {
        state.reached = true;
        await gate;
      }
      return result;
    };
    selector.setSelectorStoreForTests(connection);
    state.flight = coordinator.acceptPeerSession({
      type: 'session',
      session: current,
      admission,
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { admissionGate: { reached: boolean } })
            .admissionGate.reached,
      ),
    )
    .toBe(true);
  const other = await context.newPage();
  await loginViaUi(other, b);
  await page.evaluate(async () => {
    const realm = window as ProductionSessionRealm & {
      admissionGate: {
        release: () => void;
        flight: Promise<void>;
        selectedB: boolean;
      };
    };
    realm.admissionGate.selectedB = true;
    realm.admissionGate.release();
    await realm.admissionGate.flight;
  });
  const result = await page.evaluate(async () => {
    const realm = window as ProductionSessionRealm & {
      admissionGate: { effects: boolean[] };
    };
    const {
      coordinator,
      store: { sessionStore },
    } = realm.productionSession;
    const effects = [...realm.admissionGate.effects];
    await coordinator.acceptPeerSession({ type: 'logout' });
    const ended = sessionStore.get() === null;
    const renewed = await coordinator.bootstrapSession(true);
    return { effects, ended, email: renewed?.user.email };
  });
  expect(result.effects).toEqual([false]);
  expect(result.ended).toBe(true);
  expect(result.email).toBe(b);
  expect(await principalAfterReload(page)).toBe(b);
  expect(await principalAfterReload(other)).toBe(b);
});
