import { randomUUID } from 'node:crypto';
import { prepareKeyboard, activateByKeyboard } from './keyboard';
import {
  test,
  expect,
  login,
  seed,
  sessionNav,
  openSessionNav,
  expectSession,
  newAccount,
  proofFor,
  startSocial,
} from './helpers';

const routes = [
  ['/login', 'Đăng nhập'],
  ['/register', 'Tạo tài khoản'],
  ['/verify-email', 'Xác minh email'],
  ['/forgot-password', 'Quên mật khẩu'],
  ['/reset-password', 'Đặt lại mật khẩu'],
  ['/social-onboarding', 'Hoàn tất đăng ký'],
  ['/oauth-result', 'Kết quả đăng nhập'],
  ['/account', 'Tài khoản của bạn'],
  ['/admin/customers', 'Quản lý Customer'],
] as const;
const widths = [360, 375, 390, 430, 768, 1440] as const;

for (const width of widths) {
  for (const [url, heading] of routes) {
    test(`account route ${url} remains readable at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await expect(
        page.getByRole('heading', { level: 1, name: heading }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 1, name: heading }),
      ).toHaveCSS('font-size', '24px');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      expect(overflow, `${url} at ${width}px`).toBe(false);
    });
  }
}

test('account controls keep keyboard and reduced-motion access', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Đăng nhập', exact: true });
  await expect(submit).toHaveCSS('background-color', 'rgb(102, 88, 74)');
  await submit.hover();
  await expect(submit).toHaveCSS('background-color', 'rgb(84, 72, 61)');
  await submit.focus();
  await expect(submit).toHaveCSS('outline-style', 'solid');
  await submit.evaluate((button: HTMLButtonElement) => {
    button.disabled = true;
  });
  await expect(submit).toHaveCSS('cursor', 'not-allowed');
  await page.reload();
  await expect(submit).toBeEnabled();
  const field = page.getByRole('textbox', { name: 'Email' });
  const boundary = await field.evaluate((input) => {
    const style = getComputedStyle(input);
    return {
      color: style.borderColor,
      background: style.backgroundColor,
      height: input.getBoundingClientRect().height,
    };
  });
  expect(boundary.color).toBe('rgb(102, 88, 74)');
  expect(boundary.background).toBe('rgb(255, 255, 255)');
  expect(boundary.height).toBeGreaterThanOrEqual(44);
  await field.fill('Tên người dùng rất dài với dấu tiếng Việt '.repeat(5));
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(field).toHaveCSS('font-size', '32px');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
});

test('authenticated chrome inherits approved tokens and local sans font', async ({
  page,
}) => {
  await login(page, seed().customerA);
  const nav = sessionNav(page);
  await expect(nav).toHaveCSS('background-color', 'rgb(253, 251, 247)');
  await expect(nav).toHaveCSS('padding-left', '12px');
  const style = await nav.evaluate((node) => ({
    font: getComputedStyle(node).fontFamily,
    space: getComputedStyle(node).getPropertyValue('--space-4').trim(),
  }));
  expect(style.space).toBe('16px');
  expect(style.font).toMatch(/BeVietnamPro|beVietnamPro|be-vietnam-pro/i);
  await expect(
    nav.getByRole('button', { name: 'Đăng xuất', exact: true }),
  ).toHaveCSS('color', 'rgb(102, 88, 74)');
});

test('registration verification recovery and reset retain meaningful persistent milestones', async ({
  page,
}) => {
  const email = `journey-${randomUUID()}@example.test`,
    password = 'Initial passphrase 123!';
  await page.goto('/register');
  await expect(
    page.getByRole('button', { name: 'Đăng ký', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill(email);
  const field = page.getByLabel('Mật khẩu', { exact: true });
  await field.fill('short');
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(/8 đến 128/);
  await field.fill(password);
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Nếu yêu cầu hợp lệ',
  );
  const verification = await proofFor(email, 'LOCAL_EMAIL_VERIFICATION');
  await page.goto(`/verify-email#token=${encodeURIComponent(verification)}`);
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByRole('button', { name: 'Xác nhận email' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Email đã được xác minh',
  );
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Đăng nhập', exact: true })
    .click();
  await page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
  await expect(
    page.getByRole('button', { name: 'Gửi email khôi phục' }),
  ).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Gửi email khôi phục' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Nếu yêu cầu hợp lệ',
  );
  const reset = await proofFor(email, 'PASSWORD_RESET');
  await page.goto(`/reset-password#token=${encodeURIComponent(reset)}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  const input = page.getByLabel('Mật khẩu mới', { exact: true });
  await input.fill('short');
  await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const replacement = 'Replacement passphrase 456!';
  await input.fill(replacement);
  await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Vui lòng đăng nhập lại',
  );
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Đăng nhập', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, { id: '', email, password: replacement });
});

test('profile update and confirmed LOCAL password change preserve safe editable fields', async ({
  page,
}) => {
  const account = await newAccount('profile');
  await login(page, account);
  await page.goto('/account');
  await page
    .getByLabel('Tên hiển thị')
    .fill('Nguyễn Thị Ánh — tên tiếng Việt dài');
  await page.getByLabel(/Số điện thoại/).fill('0909123456');
  await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Đã cập nhật hồ sơ',
  );
  await page.getByLabel('Mật khẩu hiện tại').fill(account.password);
  const replacement = 'New profile passphrase 789!';
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Vui lòng đăng nhập lại',
  );
  await page.getByRole('link', { name: 'Đăng nhập lại' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, { ...account, password: replacement });
});

test('social onboarding and OAuth result complete under their existing server intents', async ({
  page,
}) => {
  const social = await startSocial(page, false);
  await page.goto(social.callback);
  await expect(
    page.getByRole('heading', { name: 'Hoàn tất đăng ký' }),
  ).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(social.email);
  await page.getByRole('button', { name: 'Gửi email xác minh' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Đã gửi hướng dẫn',
  );
  const proof = await proofFor(social.email, 'SOCIAL_EMAIL_VERIFICATION');
  await page.goto(`/social-onboarding#token=${encodeURIComponent(proof)}`);
  await page.getByRole('button', { name: 'Hoàn tất xác minh' }).click();
  await expect(
    page.getByText(`Đã đăng nhập với ${social.email}.`),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Đi đến tài khoản' }).click();
  await expect(
    page.getByText('Tài khoản mạng xã hội không sử dụng mật khẩu LOCAL.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đổi mật khẩu' })).toHaveCount(
    0,
  );
  const logoutResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/auth/logout'),
  );
  await openSessionNav(page);
  await sessionNav(page)
    .getByRole('button', { name: 'Đăng xuất', exact: true })
    .click();
  const completedLogout = await logoutResponse;
  expect(completedLogout.ok()).toBe(true);
  // Local chrome ends immediately. The happy-path journey must also wait for
  // the committed logout's selector settlement before a full navigation.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const open = indexedDB.open('wedding-auth', 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result;
              const tx = db.transaction('selector', 'readonly');
              const read = tx.objectStore('selector').get('current');
              let settled = false;
              read.onsuccess = () => {
                settled =
                  read.result?.state === 'SELECTED' &&
                  read.result.sessionTag === null &&
                  read.result.pendingIntent === null;
              };
              tx.oncomplete = () => {
                db.close();
                resolve(settled);
              };
              tx.onerror = () => {
                db.close();
                reject(tx.error);
              };
            };
          }),
      ),
    )
    .toBe(true);
  const returning = await startSocial(page);
  await page.goto(returning.callback);
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Đăng nhập thành công',
  );
  // The OAuth result is consumed once; verify its cookie on a protected reload.
  await page.goto('/account');
  await expectSession(page, returning.email);
  await page.reload();
  await expectSession(page, returning.email);
});

test('Admin search pagination and cancelled then confirmed lock actions keep authorization', async ({
  page,
}) => {
  const f = seed();
  await login(page, f.adminA);
  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Trang tiếp' }).click();
  await expect(page.getByRole('main').getByRole('status')).toHaveCount(0);
  await page.getByLabel('Tìm kiếm', { exact: true }).fill(f.customerB.email);
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  await page
    .getByRole('link', { name: f.customerB.email, exact: true })
    .click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Khóa Customer' }).click();
  await expect(
    page.getByRole('button', { name: 'Khóa Customer' }),
  ).toBeEnabled();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Khóa Customer' }).click();
  await expect(
    page.getByRole('button', { name: 'Mở khóa Customer' }),
  ).toBeEnabled();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Mở khóa Customer' }).click();
  await expect(
    page.getByRole('button', { name: 'Khóa Customer' }),
  ).toBeEnabled();
});

for (const width of widths) {
  test(`keyboard account recovery remains readable at ${width}px and actual 200 percent text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/forgot-password');
    await expect(
      page.getByRole('button', { name: 'Gửi email khôi phục' }),
    ).toBeEnabled();
    const field = page.getByLabel('Email', { exact: true });
    const normal = await field.evaluate((node) =>
      parseFloat(getComputedStyle(node).fontSize),
    );
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(field).toHaveCSS('font-size', `${normal * 2}px`);
    const enlarged = await field.evaluate((node) =>
      parseFloat(getComputedStyle(node).fontSize),
    );
    expect(enlarged).toBeGreaterThanOrEqual(normal * 2);
    await page.route('**/api/v1/auth/password-resets', (route) =>
      route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } }),
    );
    await field.focus();
    await page.keyboard.type('long-vietnamese-name@example.test');
    await page.keyboard.press('Tab');
    const submit = page.getByRole('button', { name: 'Gửi email khôi phục' });
    await expect(submit).toBeFocused();
    await expect(submit).toHaveCSS('outline-style', 'solid');
    expect(
      await submit.evaluate((node) =>
        parseFloat(getComputedStyle(node).transitionDuration),
      ),
    ).toBeLessThanOrEqual(0.01);
    const box = await submit.boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= 900).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await expect(submit).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
  });
}

test('admin customer list and detail preserve authorized navigation', async ({
  page,
}) => {
  const fixture = seed();
  await login(page, fixture.adminA);
  await page.goto('/admin/customers');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Quản lý Customer' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Tìm', exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel('Tìm kiếm', { exact: true })
    .fill(fixture.customerA.email);
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  await expect(
    page.getByRole('link', { name: fixture.customerA.email, exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: fixture.customerA.email, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Customer' }),
  ).toBeVisible();
  await expect(
    page.getByText(fixture.customerA.email, { exact: true }),
  ).toBeVisible();
});

test('global session recovery uses approved controls and remains keyboard accessible at 200 percent text', async ({
  page,
}) => {
  await prepareKeyboard(page, 360);
  await login(page, seed().customerB);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('wedding-auth', 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('selector', 'readwrite');
          const store = tx.objectStore('selector'),
            read = store.get('current');
          read.onsuccess = () =>
            store.put(
              {
                ...read.result,
                state: 'RECOVERY_REQUIRED',
                sessionTag: null,
                recoveryReason: 'STORAGE_UNAVAILABLE',
                pendingIntent: null,
                refreshLease: null,
              },
              'current',
            );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload();
  const notice = page.getByRole('alert').filter({
    hasText: 'Không thể xác nhận phiên đăng nhập trong trình duyệt này.',
  });
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCSS('font-size', '32px');
  await expect(notice).toHaveCSS('color', 'rgb(163, 79, 79)');
  await expect(notice).toHaveCSS('background-color', 'rgb(249, 238, 238)');
  expect(
    await notice.evaluate((node) => getComputedStyle(node).fontFamily),
  ).toMatch(/BeVietnamPro|beVietnamPro|be-vietnam-pro/i);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await activateByKeyboard(
    page,
    notice.getByRole('button', { name: 'Thử lại', exact: true }),
  );
  await expect(notice).toBeVisible();
});
