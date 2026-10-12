import {
  test,
  expect,
  seed,
  login,
  sessionNav,
  openSessionNav,
  expectSession,
  submitLogin,
  newAccount,
  startSocial,
  proofFor,
} from './helpers';

test('Customer unsaved invitation draft survives peer credential renewal without reload', async ({
  page,
  context,
  delivery,
}) => {
  const f = seed();
  await login(page, f.customerA);
  await page.goto(`/invitations/${f.invitationA}/edit`);
  const field = page.getByLabel('Tên cô dâu', { exact: true });
  await field.fill('Bản nháp Customer chưa lưu qua renewal');
  await page.evaluate(() => {
    (window as typeof window & { draftMarker?: string }).draftMarker =
      'mounted-draft';
  });
  const before = delivery
    .observations()
    .filter((r) => r.path === '/api/v1/auth/refresh').length;
  const peer = await context.newPage();
  await peer.goto('/account');
  await expectSession(peer, f.customerA.email);
  expect(
    delivery.observations().filter((r) => r.path === '/api/v1/auth/refresh')
      .length,
  ).toBeGreaterThan(before);
  await expect(field).toHaveValue('Bản nháp Customer chưa lưu qua renewal');
  expect(
    await page.evaluate(
      () => (window as typeof window & { draftMarker?: string }).draftMarker,
    ),
  ).toBe('mounted-draft');
  await expect(page).toHaveURL(
    new RegExp(`/invitations/${f.invitationA}/edit$`),
  );
});

test('late invitation resource completion cannot navigate or overwrite the next resource', async ({
  page,
  delivery,
}) => {
  const f = seed();
  await login(page, f.customerA);
  await page.goto('/invitations');
  const other = page
    .locator(
      `a[href$="/edit"]:not([href="/invitations/${f.invitationA}/edit"])`,
    )
    .first();
  await expect(other).toBeVisible();
  const next = (await other.getAttribute('href'))!;
  await page.evaluate(() => {
    (window as typeof window & { resourceMarker?: string }).resourceMarker =
      'resource-document';
  });
  const path = `/api/v1/invitations/${f.invitationA}`;
  delivery.hold({ method: 'GET', path, times: 1 });
  await page.locator(`a[href="/invitations/${f.invitationA}/edit"]`).click();
  const held = await delivery.nextHeld({ path });
  await held.committed;
  // The resource request can start before Next commits the navigation/history.
  // Back must leave the editor, rather than the still-current invitation list.
  await expect(page).toHaveURL(
    new RegExp(`/invitations/${f.invitationA}/edit$`),
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/invitations$/);
  await page.locator(`a[href="${next}"]`).click();
  const field = page.getByLabel('Tên cô dâu', { exact: true });
  await field.fill('Bản nháp riêng của resource mới');
  await held.release();
  await expect(field).toHaveValue('Bản nháp riêng của resource mới');
  await expect(page).toHaveURL(new RegExp(next + '$'));
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { resourceMarker?: string }).resourceMarker,
    ),
  ).toBe('resource-document');
});

test('queued renewal is cancelled before dispatch when its Customer owner changes', async ({
  page,
  context,
  delivery,
}) => {
  const f = seed();
  await login(page, f.customerA);
  await page.goto('/invitations');
  await expect(
    page.locator(`a[href="/invitations/${f.invitationA}/edit"]`),
  ).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('wedding-auth', 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('selector', 'readwrite'),
            store = tx.objectStore('selector');
          const read = store.get('current');
          read.onsuccess = () =>
            store.put(
              {
                ...read.result,
                refreshLease: {
                  attemptId: 'owned-queue-blocker',
                  at: Date.now(),
                },
              },
              'current',
            );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await context.addInitScript(() => {
    const original = IDBObjectStore.prototype.get;
    const counters = window as typeof window & { selectorReads: number };
    counters.selectorReads = 0;
    IDBObjectStore.prototype.get = function (key) {
      if (this.name === 'selector' && key === 'current')
        counters.selectorReads++;
      return original.call(this, key);
    };
  });
  // Install observation in the current document without reloading its admission.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.get;
    const counters = window as typeof window & { selectorReads: number };
    counters.selectorReads = 0;
    IDBObjectStore.prototype.get = function (key) {
      if (this.name === 'selector' && key === 'current')
        counters.selectorReads++;
      return original.call(this, key);
    };
  });
  const path = `/api/v1/invitations/${f.invitationA}`;
  let oldReads = 0;
  let originalAuthorization: string | undefined;
  await page.route(`**${path}`, async (route) => {
    const authorization = route.request().headers().authorization;
    originalAuthorization ??= authorization;
    // B can mount this route while the peer admission propagates. Let its
    // fresh load reach the API (and receive the real ownership denial).
    if (authorization !== originalAuthorization) {
      await route.continue();
      return;
    }
    oldReads++;
    await route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } });
  });
  const refreshes = () =>
    delivery.observations().filter((r) => r.path === '/api/v1/auth/refresh')
      .length;
  const before = refreshes();
  // Client navigation retains the observer and starts only the resource request.
  await page.locator(`a[href="/invitations/${f.invitationA}/edit"]`).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { selectorReads: number }).selectorReads,
      ),
    )
    .toBeGreaterThan(2);
  // Next dev StrictMode can start two initial effect loads. Capture those
  // requests after the renewal is queued; neither may replay under B.
  const initialReads = oldReads;
  expect(initialReads).toBeGreaterThan(0);
  expect(initialReads).toBeLessThanOrEqual(2);
  expect(refreshes()).toBe(before);
  const peer = await context.newPage();
  await login(peer, f.customerB);
  await expectSession(page, f.customerB.email);
  expect(refreshes()).toBe(before);
  await page.goto(`/invitations/${f.invitationB}/edit`);
  await expect(page.getByLabel('Tên cô dâu', { exact: true })).toBeVisible();
  expect(oldReads).toBe(initialReads);
  await expect(
    page.getByText('Không thể gửi yêu cầu xác nhận phiên đăng nhập'),
  ).toHaveCount(0);
});

test('queued renewal expires before dispatch and explicit login recovers', async ({
  page,
  delivery,
}) => {
  const account = await newAccount('queued-expiry');
  await login(page, account);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('wedding-auth', 1);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('selector', 'readwrite');
          const objects = tx.objectStore('selector');
          const read = objects.get('current');
          read.onsuccess = () =>
            objects.put(
              {
                ...read.result,
                refreshLease: { attemptId: 'other-tab', at: Date.now() },
              },
              'current',
            );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  const refreshCount = () =>
    delivery
      .observations()
      .filter((r) => r.method === 'POST' && r.path === '/api/v1/auth/refresh')
      .length;
  const before = refreshCount();
  await page.reload();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Không thể gửi yêu cầu xác nhận phiên đăng nhập' }),
  ).toBeVisible({ timeout: 12000 });
  expect(refreshCount()).toBe(before);
  await page.goto('/login');
  await submitLogin(page, account);
  await expectSession(page, account.email);
});

test('Customer save completion cannot publish under a newer owner', async ({
  page,
  context,
  delivery,
}) => {
  const f = seed();
  await login(page, f.customerA);
  await page.goto(`/invitations/${f.invitationA}/edit`);
  const field = page.getByLabel('Tên cô dâu', { exact: true });
  await field.fill(`Bản nháp trước khi đổi tài khoản ${crypto.randomUUID()}`);
  const path = `/api/v1/invitations/${f.invitationA}/draft`;
  delivery.hold({ method: 'PATCH', path, times: 1 });
  let published = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/publish(?:\?|$)/.test(request.url()))
      published++;
  });
  await page
    .getByRole('button', { name: 'Xuất bản thiệp', exact: true })
    .click();
  const held = await delivery.nextHeld({ path });
  await held.committed;
  const peer = await context.newPage();
  await login(peer, f.customerB);
  await expect(field).toHaveCount(0);
  await held.release();
  await expectSession(page, f.customerB.email);
  expect(published).toBe(0);
});

test('Admin draft survives same-owner renewal and is discarded on owner switch', async ({
  page,
  context,
}) => {
  const f = seed();
  await login(page, f.adminA);
  await page.goto('/admin/templates/new');
  await page
    .getByLabel('Tên mẫu', { exact: true })
    .fill('Owned draft isolation fixture');
  await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/templates\/[^/]+\/edit$/);
  const templateId = new URL(page.url()).pathname.split('/').at(-2)!;
  await page.getByRole('button', { name: 'Thêm văn bản', exact: true }).click();
  const content = page.getByRole('textbox', { name: 'Nội dung', exact: true });
  await content.fill('Bản nháp Admin giữ qua renewal');
  let intercepted = false;
  await page.route(
    `**/api/v1/admin/templates/${templateId}/draft`,
    async (route) => {
      if (!intercepted && route.request().method() === 'PATCH') {
        intercepted = true;
        await route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } });
      } else await route.continue();
    },
  );
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Lưu bản nháp', exact: true }),
  ).toBeEnabled();
  expect(intercepted).toBe(true);
  await expect(content).toHaveValue('Bản nháp Admin giữ qua renewal');
  await content.fill('Bản nháp chưa lưu chỉ thuộc Admin A');
  const peer = await context.newPage();
  await login(peer, f.adminB);
  await expectSession(page, f.adminB.email);
  await expect
    .poll(() =>
      page
        .locator('textarea')
        .evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLTextAreaElement).value),
        ),
    )
    .not.toContain('Bản nháp chưa lưu chỉ thuộc Admin A');
});

for (const transition of [
  'same-role',
  'different-role',
  'logout-login',
  'A-B-A',
] as const) {
  test(`private invitations discard prior owner on ${transition}`, async ({
    page,
    context,
  }) => {
    const f = seed();
    await login(page, f.customerA);
    await page.goto('/invitations');
    const privateLink = page.locator(
      `a[href="/invitations/${f.invitationA}/edit"]`,
    );
    // The seeded item may be on the next page; load actual pagination first.
    const more = page.getByRole('button', { name: 'Tải thêm thiệp' });
    while (await more.count()) {
      await more.click();
      await expect
        .poll(async () => !(await more.count()) || (await more.isEnabled()))
        .toBe(true);
    }
    await expect(privateLink).toBeVisible();
    const peer = await context.newPage();
    if (transition === 'logout-login') {
      await openSessionNav(page);
      await sessionNav(page)
        .getByRole('button', { name: 'Đăng xuất', exact: true })
        .click();
      await expect(privateLink).toHaveCount(0);
    }
    const next = transition === 'different-role' ? f.adminA : f.customerB;
    await login(peer, next);
    await expectSession(page, next.email);
    await expect(privateLink).toHaveCount(0);
    if (transition === 'A-B-A') {
      await login(peer, f.customerA);
      await expectSession(page, f.customerA.email);
    }
    await page.reload();
    await expectSession(
      page,
      transition === 'A-B-A' ? f.customerA.email : next.email,
    );
  });
}

for (const outcome of ['success', 'failure', 'pagination'] as const) {
  test(`late private ${outcome} cannot restore A after B load fails`, async ({
    page,
    context,
    delivery,
  }) => {
    const f = seed();
    await login(page, f.customerA);
    await page.goto('/invitations');
    await expect(
      page.locator(`a[href="/invitations/${f.invitationA}/edit"]`),
    ).toBeVisible();
    if (outcome === 'pagination')
      await expect(
        page.getByRole('button', { name: 'Tải thêm thiệp' }),
      ).toBeVisible();
    const pattern = /\/api\/v1\/invitations(?:\?|$)/;
    delivery.hold({ method: 'GET', path: pattern });
    if (outcome === 'pagination')
      await page.getByRole('button', { name: 'Tải thêm thiệp' }).click();
    else {
      // Router back can restore the mounted/cached list without a new GET.
      // Reload starts a real owned load for the delayed-response boundary.
      await page.reload();
    }
    const held = await delivery.nextHeld({ path: pattern });
    await held.committed;
    delivery.clearHolds();
    const peer = await context.newPage();
    await page.route('**/api/v1/invitations*', (route) =>
      route.fulfill({ status: 503, json: { code: 'STORAGE_UNAVAILABLE' } }),
    );
    await login(peer, f.customerB);
    await expectSession(page, f.customerB.email);
    for (const response of [...delivery.held()]) {
      await response.committed;
      if (outcome === 'failure') response.drop();
      else await response.release();
    }
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await expect(
      page.locator(`a[href="/invitations/${f.invitationA}/edit"]`),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Tải thêm thiệp' }),
    ).toHaveCount(0);
  });
}

test('same-owner renewal preserves profile drafts and password inputs without reload', async ({
  page,
}) => {
  const f = seed();
  await login(page, f.customerA);
  await page.goto('/account');
  await page.getByLabel('Tên hiển thị').fill('Bản nháp tiếng Việt của A');
  await page
    .getByLabel('Mật khẩu mới', { exact: true })
    .fill('Unsaved password 123!');
  let first = true;
  await page.route('**/api/v1/me', async (route) => {
    if (route.request().method() === 'PATCH' && first) {
      first = false;
      await route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Đã cập nhật hồ sơ',
  );
  await expect(page.getByLabel('Tên hiển thị')).toHaveValue(
    'Bản nháp tiếng Việt của A',
  );
  await expect(page.getByLabel('Mật khẩu mới', { exact: true })).toHaveValue(
    'Unsaved password 123!',
  );
});

test('identity switch removes invitation draft and its dirty-navigation registration', async ({
  page,
  context,
}) => {
  const f = seed();
  await login(page, f.customerA);
  await page.goto(`/invitations/${f.invitationA}/edit`);
  const field = page.getByLabel('Tên cô dâu', { exact: true });
  await field.fill('Bản nháp riêng tư không được giữ');
  const peer = await context.newPage();
  await login(peer, f.customerB);
  await expect(field).toHaveCount(0);
  let dialogs = 0;
  page.on('dialog', (dialog) => {
    dialogs++;
    void dialog.dismiss();
  });
  await page.goto('/invitations');
  expect(dialogs).toBe(0);
  await expect(page.getByText('Bản nháp riêng tư không được giữ')).toHaveCount(
    0,
  );
});

test('Admin stale lock completion cannot reload records for a newer Admin', async ({
  page,
  context,
  delivery,
}) => {
  const f = seed();
  await login(page, f.adminA);
  await page.goto(`/admin/customers/${f.customerB.id}`);
  await expect(
    page.getByRole('button', { name: 'Khóa Customer' }),
  ).toBeVisible();
  const path = `/api/v1/admin/customers/${f.customerB.id}/lock`;
  delivery.hold({ method: 'POST', path, times: 1 });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Khóa Customer' }).click();
  const held = await delivery.nextHeld({ path });
  await held.committed;
  const peer = await context.newPage();
  await login(peer, f.adminB);
  await expectSession(page, f.adminB.email);
  await held.release();
  await expect(
    page.getByRole('button', { name: 'Mở khóa Customer' }),
  ).toBeVisible();
  // Restore the shared fixture explicitly under the current authorized Admin.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Mở khóa Customer' }).click();
  await expect(
    page.getByRole('button', { name: 'Khóa Customer' }),
  ).toBeVisible();
});

for (const writer of ['refresh', 'logout', 'login', 'password'] as const) {
  test(`late ${writer} response preserves B through real reload and renewal`, async ({
    page,
    context,
    delivery,
  }) => {
    const a = await newAccount(`late-${writer}-a`),
      b = await newAccount(`late-${writer}-b`);
    await login(page, a);
    const path =
      writer === 'password' ? '/api/v1/me/password' : `/api/v1/auth/${writer}`;
    if (writer === 'password') {
      await page.goto('/account');
      await page.getByLabel('Mật khẩu hiện tại').fill(a.password);
      await page
        .getByLabel('Mật khẩu mới', { exact: true })
        .fill('Replacement passphrase 456!');
    } else if (writer === 'login') await page.goto('/login');
    delivery.hold({ method: 'POST', path, times: 1 });
    if (writer === 'refresh') void page.reload().catch(() => undefined);
    else if (writer === 'logout') {
      await openSessionNav(page);
      await sessionNav(page)
        .getByRole('button', { name: 'Đăng xuất', exact: true })
        .click();
    } else if (writer === 'login') await submitLogin(page, a);
    else await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    const held = await delivery.nextHeld({ path });
    await held.committed;
    const peer = await context.newPage();
    await login(peer, b);
    await held.release();
    await page.goto('/account');
    await expectSession(page, b.email);
    await expect(
      page.getByText(`Email: ${b.email}`, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expectSession(page, b.email);
  });
}

test('queued renewal without Web Locks remains bounded when its owner tab closes', async ({
  context,
  page,
  delivery,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'locks', {
      get: () => undefined,
      configurable: true,
    }),
  );
  const account = await newAccount('no-locks');
  await login(page, account);
  delivery.hold({ method: 'POST', path: '/api/v1/auth/refresh', times: 1 });
  void page.reload().catch(() => undefined);
  const held = await delivery.nextHeld({ path: '/api/v1/auth/refresh' });
  await held.committed;
  const peer = await context.newPage();
  await peer.goto('/account');
  await page.close();
  await held.release();
  // Revocation after lost rotation may require recovery; it must never admit another owner.
  await expect(peer.getByRole('main')).toBeVisible();
  await expect(peer.locator('body')).not.toContainText(seed().customerA.email);
  await expect
    .poll(
      async () => {
        const avatar = peer.getByRole('button', {
          name: 'Tài khoản',
          exact: true,
        });
        if (await avatar.isVisible()) await openSessionNav(peer);
        return (
          (
            await sessionNav(peer)
              .textContent({ timeout: 100 })
              .catch(() => '')
          )?.includes(account.email) ||
          (await peer
            .getByRole('alert')
            .filter({ hasText: /\S/ })
            .first()
            .isVisible()) ||
          ((await peer
            .getByRole('main')
            .getByRole('link', {
              name: 'đăng nhập',
              exact: true,
            })
            .isVisible()) &&
            (await peer.evaluate(
              () =>
                new Promise<boolean>((resolve, reject) => {
                  const open = indexedDB.open('wedding-auth', 1);
                  open.onsuccess = () => {
                    const db = open.result;
                    const tx = db.transaction('selector', 'readonly');
                    const read = tx.objectStore('selector').get('current');
                    let released = false;
                    read.onsuccess = () => {
                      released = !read.result?.refreshLease;
                    };
                    tx.oncomplete = () => {
                      db.close();
                      resolve(released);
                    };
                    tx.onerror = () => {
                      db.close();
                      reject(tx.error);
                    };
                  };
                  open.onerror = () => reject(open.error);
                }),
            )))
        );
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await login(peer, account);
  await peer.reload();
  await expectSession(peer, account.email);
});

test('late OAuth callback cannot admit its account after a newer LOCAL intent', async ({
  page,
  context,
}) => {
  const social = await startSocial(page);
  const peer = await context.newPage(),
    account = await newAccount('oauth-newer');
  await login(peer, account);
  await page.goto(social.callback);
  await expect(page.getByText(/được thay thế/i)).toBeVisible();
  await page.goto('/account');
  await expectSession(page, account.email);
  await page.reload();
  await expectSession(page, account.email);
});

test('late onboarding confirmation cannot replace a newer LOCAL admission', async ({
  page,
  context,
  delivery,
}) => {
  const social = await startSocial(page, false);
  await page.goto(social.callback);
  await page.getByLabel('Email', { exact: true }).fill(social.email);
  await page.getByRole('button', { name: 'Gửi email xác minh' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Đã gửi hướng dẫn',
  );
  const proof = await proofFor(social.email, 'SOCIAL_EMAIL_VERIFICATION');
  await page.goto(`/social-onboarding#token=${encodeURIComponent(proof)}`);
  const path = '/api/v1/auth/social-onboarding/verifications/confirm';
  delivery.hold({ method: 'POST', path, times: 1 });
  await page.getByRole('button', { name: 'Hoàn tất xác minh' }).click();
  const held = await delivery.nextHeld({ path });
  await held.committed;
  const peer = await context.newPage(),
    account = await newAccount('onboarding-newer');
  await login(peer, account);
  await held.release();
  await expect(page.getByText(`Đã đăng nhập với ${social.email}.`)).toHaveCount(
    0,
  );
  await page.goto('/account');
  await expectSession(page, account.email);
  await page.reload();
  await expectSession(page, account.email);
});

test('two tabs renew the same account without Web Locks or a deadlock', async ({
  context,
  page,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'locks', {
      get: () => undefined,
      configurable: true,
    }),
  );
  const account = await newAccount('contention');
  await login(page, account);
  const peer = await context.newPage();
  await Promise.all([page.reload(), peer.goto('/account')]);
  await expectSession(page, account.email);
  await expectSession(peer, account.email);
  await peer.reload();
  await expectSession(peer, account.email);
});

test('dispatched login timeout exposes uncertainty without mutation replay', async ({
  page,
  delivery,
}) => {
  const account = await newAccount('uncertain');
  await page.goto('/login');
  const path = '/api/v1/auth/login';
  delivery.hold({ method: 'POST', path, times: 1 });
  await submitLogin(page, account);
  const held = await delivery.nextHeld({ path });
  await held.committed;
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible({
    timeout: 20000,
  });
  expect(
    delivery
      .observations()
      .filter((r) => r.path === path && r.method === 'POST'),
  ).toHaveLength(1);
  held.drop();
});
