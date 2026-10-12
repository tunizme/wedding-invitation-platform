import { randomUUID } from 'node:crypto';
import {
  test,
  expect,
  seed,
  newAccount,
  proofFor,
  startSocial,
  expectSession,
} from './helpers';
import {
  prepareKeyboard,
  typeByKeyboard,
  activateByKeyboard,
  assertReadable,
  loginByKeyboard,
} from './keyboard';

for (const width of [360, 375, 390, 430, 768, 1440]) {
  test(`keyboard registration verification and login at ${width}px with enlarged Vietnamese feedback`, async ({
    page,
    delivery,
  }) => {
    await prepareKeyboard(page, width);
    const email = `keyboard-register-${randomUUID()}@example.test`,
      password = 'Keyboard passphrase 123!';
    await page.goto('/register');
    await typeByKeyboard(
      page,
      page.getByLabel('Email', { exact: true }),
      email,
    );
    const field = page.getByLabel('Mật khẩu', { exact: true });
    await typeByKeyboard(page, field, 'short');
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Đăng ký', exact: true }),
    );
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAccessibleDescription(/8 đến 128/);
    await assertReadable(page);
    await typeByKeyboard(page, field, password);
    const path = '/api/v1/auth/registrations';
    delivery.hold({ method: 'POST', path, times: 1 });
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Đăng ký', exact: true }),
    );
    const held = await delivery.nextHeld({ path });
    await held.committed;
    await expect(field).toBeDisabled();
    await held.release();
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Nếu yêu cầu hợp lệ',
    );
    await assertReadable(page);
    const proof = await proofFor(email, 'LOCAL_EMAIL_VERIFICATION');
    await page.goto(`/verify-email#token=${encodeURIComponent(proof)}`);
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Xác nhận email', exact: true }),
    );
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Email đã được xác minh',
    );
    await assertReadable(page);
    await activateByKeyboard(
      page,
      page
        .getByRole('main')
        .getByRole('link', { name: 'Đăng nhập', exact: true }),
    );
    await loginByKeyboard(page, { id: '', email, password });
    await activateByKeyboard(
      page,
      page.getByRole('link', { name: 'Thông tin cá nhân', exact: true }),
    );
    await expect(
      page.getByRole('heading', { name: 'Tài khoản của bạn', exact: true }),
    ).toBeVisible();
    await expectSession(page, email, true);
    await assertReadable(page);
  });

  test(`keyboard password recovery and reset at ${width}px with local errors`, async ({
    page,
  }) => {
    await prepareKeyboard(page, width);
    const account = await newAccount('keyboard-reset');
    await page.goto('/forgot-password');
    await typeByKeyboard(
      page,
      page.getByLabel('Email', { exact: true }),
      account.email,
    );
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Gửi email khôi phục' }),
    );
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Nếu yêu cầu hợp lệ',
    );
    await assertReadable(page);
    const proof = await proofFor(account.email, 'PASSWORD_RESET');
    await page.goto(`/reset-password#token=${encodeURIComponent(proof)}`);
    const field = page.getByLabel('Mật khẩu mới', { exact: true });
    await typeByKeyboard(page, field, 'short');
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Đặt lại mật khẩu', exact: true }),
    );
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await assertReadable(page);
    const password = 'Keyboard reset passphrase 456!';
    await typeByKeyboard(page, field, password);
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Đặt lại mật khẩu', exact: true }),
    );
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Vui lòng đăng nhập lại',
    );
    await assertReadable(page);
    await loginByKeyboard(page, { ...account, password });
  });

  test(`keyboard profile recovery and password change at ${width}px`, async ({
    page,
    delivery,
  }) => {
    await prepareKeyboard(page, width);
    const account = await newAccount('keyboard-profile');
    await loginByKeyboard(page, account);
    await page.goto('/account');
    const name = page.getByLabel('Tên hiển thị');
    const longName = 'Nguyễn Thị Ánh Hồng — tên tiếng Việt dài với đầy đủ dấu';
    await typeByKeyboard(page, name, longName);
    let fail = true;
    await page.route('**/api/v1/me', async (route) => {
      if (fail && route.request().method() === 'PATCH') {
        fail = false;
        await route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
      } else await route.continue();
    });
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Lưu hồ sơ' }),
    );
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await expect(name).toHaveValue(longName);
    await assertReadable(page);
    delivery.hold({ method: 'PATCH', path: '/api/v1/me', times: 1 });
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Lưu hồ sơ' }),
    );
    const held = await delivery.nextHeld({ path: '/api/v1/me' });
    await held.committed;
    await expect(name).toBeDisabled();
    await held.release();
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Đã cập nhật hồ sơ',
    );
    await expect(name).toHaveValue(longName);
    await typeByKeyboard(
      page,
      page.getByLabel('Mật khẩu hiện tại'),
      account.password,
    );
    const password = 'Keyboard new passphrase 789!';
    await typeByKeyboard(
      page,
      page.getByLabel('Mật khẩu mới', { exact: true }),
      password,
    );
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }),
    );
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Vui lòng đăng nhập lại',
    );
    await assertReadable(page);
    await activateByKeyboard(
      page,
      page.getByRole('link', { name: 'Đăng nhập lại', exact: true }),
    );
    await loginByKeyboard(page, { ...account, password });
  });

  test(`keyboard authorized Admin pagination search and lock confirmation at ${width}px`, async ({
    page,
  }) => {
    await prepareKeyboard(page, width);
    const customer = await newAccount('keyboard-managed');
    await loginByKeyboard(page, seed().adminA);
    await page.goto('/admin/customers');
    await expect(
      page.getByRole('heading', { name: 'Danh sách Customer' }),
    ).toBeVisible();
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Trang tiếp' }),
    );
    await expect(page.getByRole('main').getByRole('status')).toHaveCount(0);
    await typeByKeyboard(
      page,
      page.getByLabel('Tìm kiếm', { exact: true }),
      customer.email,
    );
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Tìm', exact: true }),
    );
    await activateByKeyboard(
      page,
      page.getByRole('link', { name: customer.email, exact: true }),
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Customer' }),
    ).toBeVisible();
    await assertReadable(page);
    page.once('dialog', (dialog) => dialog.dismiss());
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Khóa Customer', exact: true }),
    );
    await expect(
      page.getByRole('button', { name: 'Khóa Customer', exact: true }),
    ).toBeEnabled();
    page.once('dialog', (dialog) => dialog.accept());
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Khóa Customer', exact: true }),
    );
    await expect(
      page.getByRole('button', { name: 'Mở khóa Customer', exact: true }),
    ).toBeEnabled();
    page.once('dialog', (dialog) => dialog.accept());
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Mở khóa Customer', exact: true }),
    );
    await expect(
      page.getByRole('button', { name: 'Khóa Customer', exact: true }),
    ).toBeEnabled();
    await assertReadable(page);
  });

  test(`keyboard social onboarding milestone and next action at ${width}px`, async ({
    page,
    delivery,
  }) => {
    await prepareKeyboard(page, width);
    const social = await startSocial(page, false, (control) =>
      activateByKeyboard(page, control),
    );
    await page.goto(social.callback);
    await typeByKeyboard(
      page,
      page.getByLabel('Email', { exact: true }),
      social.email,
    );
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Gửi email xác minh', exact: true }),
    );
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Đã gửi hướng dẫn',
    );
    await assertReadable(page);
    const proof = await proofFor(social.email, 'SOCIAL_EMAIL_VERIFICATION');
    await page.goto(`/social-onboarding#token=${encodeURIComponent(proof)}`);
    const path = '/api/v1/auth/social-onboarding/verifications/confirm';
    delivery.hold({ method: 'POST', path, times: 1 });
    await activateByKeyboard(
      page,
      page.getByRole('button', { name: 'Hoàn tất xác minh', exact: true }),
    );
    const held = await delivery.nextHeld({ path });
    await held.committed;
    await expect(
      page.getByRole('button', { name: 'Hoàn tất xác minh', exact: true }),
    ).toBeDisabled();
    await held.release();
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      `Đã đăng nhập với ${social.email}`,
    );
    await assertReadable(page);
    await activateByKeyboard(
      page,
      page.getByRole('link', { name: 'Đi đến tài khoản', exact: true }),
    );
    await expectSession(page, social.email, true);
    await expect(
      page.getByText('Tài khoản mạng xã hội không sử dụng mật khẩu LOCAL.'),
    ).toBeVisible();
    await assertReadable(page);
  });

  test(`keyboard verified OAuth result next action at ${width}px`, async ({
    page,
  }) => {
    await prepareKeyboard(page, width);
    const social = await startSocial(page, true, (control) =>
      activateByKeyboard(page, control),
    );
    await page.goto(social.callback);
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Đăng nhập thành công',
    );
    await activateByKeyboard(
      page,
      page.getByRole('link', { name: 'Đi đến tài khoản', exact: true }),
    );
    await expectSession(page, social.email, true);
    await assertReadable(page);
  });
}
