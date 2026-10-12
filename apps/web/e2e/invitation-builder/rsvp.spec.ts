import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

test('mobile guest persists once after lost response; owner controls immediately and only owner reads inert responses', async ({
  page,
  browser,
  builderOrigin,
}) => {
  test.setTimeout(180000);
  const seedPath = process.env.BUILDER_TEST_BROWSER_SEED,
    apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!seedPath || !apiBase)
    throw new Error('Builder runner-owned browser seed and API URL required.');
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    rsvpCustomer: { email: string; password: string };
    rsvpTemplate: { id: string };
    rsvpAdmin: { email: string; password: string };
    rsvpOther: { email: string; password: string };
  };
  async function login(
    target: Page,
    user: { email: string; password: string },
  ) {
    await target.goto(builderOrigin + '/login');
    await expect(
      target.getByRole('button', { name: 'Đăng nhập', exact: true }),
    ).toBeEnabled();
    await target.getByLabel('Email', { exact: true }).fill(user.email);
    await target.getByLabel('Mật khẩu', { exact: true }).fill(user.password);
    await target
      .getByRole('button', { name: 'Đăng nhập', exact: true })
      .click();
    await expect(
      target.getByRole('navigation', { name: 'Phiên đăng nhập' }),
    ).toContainText(user.email);
  }
  await login(page, seed.rsvpCustomer);
  await page.goto(builderOrigin + '/templates');
  await page.getByLabel('Tìm mẫu', { exact: true }).fill('Mẫu RSVP');
  await expect(
    page.getByRole('button', { name: 'Chọn mẫu Mẫu RSVP', exact: true }),
  ).toBeVisible();
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url() === apiBase + '/invitations' &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Chọn mẫu Mẫu RSVP', exact: true })
    .click();
  const created = await createdResponse;
  if (created.status() !== 201) {
    const problem = (await created.json()) as { code?: string };
    throw new Error(
      `Invitation creation failed: ${created.status()} ${problem.code ?? 'unknown'}`,
    );
  }
  await expect(page).toHaveURL(/\/invitations\/[a-f0-9-]+\/edit$/, {
    timeout: 15000,
  });
  const edit = page.url(),
    id = new URL(edit).pathname.split('/').at(-2)!;
  await page
    .getByRole('button', { name: 'Xuất bản thiệp', exact: true })
    .click();
  const link = page.getByRole('link', { name: 'Xem thiệp công khai' });
  await expect(link).toHaveAttribute('href', /\/i\/[a-f0-9-]+$/, {
    timeout: 90000,
  });
  const publicPath = (await link.getAttribute('href'))!,
    slug = publicPath.split('/').at(-1)!;
  const guestContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
    }),
    guest = await guestContext.newPage();
  try {
    await guest.goto(builderOrigin + publicPath);
    await expect(
      guest.getByRole('button', { name: 'Gửi phản hồi' }),
    ).toBeEnabled();
    const validationPosts: string[] = [];
    guest.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/rsvps'))
        validationPosts.push(request.url());
    });
    await guest.getByLabel('Tên khách mời').fill(' ');
    await guest.getByLabel('Số người (gồm bạn)').fill('0');
    await guest.getByLabel('Lời nhắn').fill('😀'.repeat(1001));
    await guest.getByRole('button', { name: 'Gửi phản hồi' }).click();
    for (const [label, error] of [
      [
        'Tên khách mời',
        'Tên cần 1–120 ký tự sau khi bỏ khoảng trắng ở hai đầu.',
      ],
      [
        'Số người (gồm bạn)',
        'Số người phải là số nguyên từ 1 đến 20, gồm bạn.',
      ],
      ['Lời nhắn', 'Lời nhắn tối đa 1000 ký tự.'],
    ]) {
      await expect(guest.getByLabel(label)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(guest.getByLabel(label)).toHaveAccessibleDescription(error);
      expect(
        await guest.getByText(error, { exact: true }).evaluate((error) => {
          const frame = error
            .closest('[data-rendered-element]')!
            .getBoundingClientRect();
          const rect = error.getBoundingClientRect();
          return (
            rect.bottom <= frame.bottom + 1 && rect.right <= frame.right + 1
          );
        }),
      ).toBe(true);
    }
    const stateRoute = '**/public/invitations/*/rsvp-state';
    await guest.route(stateRoute, (route) => route.abort('failed'));
    await guest.evaluate(() => window.dispatchEvent(new Event('focus')));
    const offline = guest
      .getByRole('status')
      .filter({ hasText: 'Hãy thử lại khi có kết nối' });
    await expect(offline).toBeVisible();
    expect(
      await offline.evaluate((status) => {
        const frame = status
          .closest('[data-rendered-element]')!
          .getBoundingClientRect();
        const rect = status.getBoundingClientRect();
        return rect.bottom <= frame.bottom + 1 && rect.right <= frame.right + 1;
      }),
    ).toBe(true);
    await expect(guest.locator('[aria-invalid="true"]')).toHaveCount(3);
    await expect(guest.getByLabel('Lời nhắn')).toHaveValue('😀'.repeat(1001));
    await guest.unroute(stateRoute);
    await guest.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(offline).toHaveCount(0);
    await expect(
      guest.getByRole('button', { name: 'Gửi phản hồi' }),
    ).toBeEnabled();
    expect(validationPosts).toHaveLength(0);
    await guest.getByLabel('Tên khách mời').fill('Khách di động');
    await expect(guest.getByLabel('Tên khách mời')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(guest.getByLabel('Số người (gồm bạn)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    const message = '<script>window.rsvpInjection=true</script>';
    await guest.getByLabel('Tên khách mời').fill('Khách di động');
    await guest.getByLabel('Số người (gồm bạn)').fill('2');
    await guest.getByLabel('Lời nhắn').fill(message);
    const attempts: { key: string | null; body: string | null }[] = [];
    let lose = true;
    await guest.route('**/public/invitations/*/rsvps', async (route) => {
      const req = route.request();
      attempts.push({
        key: req.headers()['idempotency-key'] ?? null,
        body: req.postData(),
      });
      if (lose) {
        lose = false;
        const persisted = await route.fetch();
        expect(persisted.status()).toBe(201);
        await route.abort('failed');
      } else await route.continue();
    });
    await guest.getByRole('button', { name: 'Gửi phản hồi' }).click();
    await expect(
      guest.getByRole('alert').filter({ hasText: 'Chưa xác định' }),
    ).toBeVisible();
    await page.goto(builderOrigin + `/invitations/${id}/rsvps`);
    await expect(
      page.getByText('Khách di động', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => Reflect.get(window, 'rsvpInjection')),
    ).toBeUndefined();
    await page.getByRole('button', { name: 'Đóng nhận RSVP' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Nhận RSVP:' }),
    ).toContainText('Đã đóng');
    await guest.evaluate(() => window.dispatchEvent(new Event('focus')));
    await guest.getByRole('button', { name: 'Thử gửi lại' }).click();
    await expect(
      guest.getByText('Cảm ơn bạn đã phản hồi', { exact: true }),
    ).toBeVisible();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    await page.getByRole('button', { name: 'Tải lại phản hồi' }).click();
    await expect(page.getByText('Khách di động', { exact: true })).toHaveCount(
      1,
    );
    await guest.getByRole('button', { name: 'Gửi phản hồi mới' }).click();
    await expect(
      guest.getByText('Đã đóng nhận phản hồi', { exact: true }),
    ).toBeVisible();
    const denied = await guest.request.post(
      `${apiBase}/public/invitations/${slug}/rsvps`,
      {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        data: { name: 'Bypass', attendance: 'ATTENDING', partySize: 1 },
      },
    );
    expect(denied.status()).toBe(409);
    await page.getByRole('button', { name: 'Mở nhận RSVP' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Nhận RSVP:' }),
    ).toContainText('Đang mở');
    await guest.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(guest.getByLabel('Tên khách mời')).toHaveValue(
      'Khách di động',
    );
    await guest.getByRole('combobox').selectOption('DECLINED');
    await guest.getByRole('button', { name: 'Gửi phản hồi' }).click();
    await expect(
      guest.getByText('Cảm ơn bạn đã phản hồi', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tải lại phản hồi' }).click();
    await expect(page.getByText('Khách di động', { exact: true })).toHaveCount(
      2,
    );
    await expect(page.getByText(/Không tham dự · 0 người/)).toBeVisible();
    expect(
      await guest.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(360);
    await page.goto(edit);
    await page
      .getByRole('button', { name: 'Gỡ xuất bản', exact: true })
      .click();
    await expect(page.getByText(/Mẫu: Mẫu RSVP · UNPUBLISHED/)).toBeVisible();
    expect(
      (
        await guest.request.get(
          `${apiBase}/public/invitations/${slug}/rsvp-state`,
        )
      ).status(),
    ).toBe(404);
    await page.goto(builderOrigin + `/invitations/${id}/rsvps`);
    await expect(page.getByText('Khách di động', { exact: true })).toHaveCount(
      2,
    );
    expect(
      (await guest.request.get(`${apiBase}/invitations/${id}/rsvps`)).status(),
    ).toBe(401);
    // A real second login supplies the supported peer-session broadcast while
    // the first tab stays mounted on the owner's private response route.
    const peer = await page.context().newPage();
    try {
      const loginResponse = peer.waitForResponse(
        (response) =>
          response.url() === apiBase + '/auth/login' &&
          response.request().method() === 'POST',
      );
      await login(peer, seed.rsvpOther);
      const peerSession = await (await loginResponse).json();
      const deniedRead = page.waitForResponse(
        (response) =>
          response.url() === `${apiBase}/invitations/${id}/rsvps` &&
          response.request().method() === 'GET' &&
          response.status() === 404,
      );
      await peer.evaluate((session) => {
        const channel = new BroadcastChannel('wedding-auth-session');
        channel.postMessage({ type: 'session', session });
        channel.close();
      }, peerSession);
      await deniedRead;
      await expect(page).toHaveURL(builderOrigin + `/invitations/${id}/rsvps`);
      await expect(
        page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
      ).toContainText(seed.rsvpOther.email);
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Không thể hoàn tất yêu cầu',
      );
      await expect(
        page.getByText('Khách di động', { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByText(message, { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /^(Đóng|Mở) nhận RSVP$/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Phản hồi tiếp' }),
      ).toHaveCount(0);
    } finally {
      await peer.close();
    }
    for (const user of [seed.rsvpAdmin]) {
      const foreignContext = await browser.newContext(),
        foreign = await foreignContext.newPage();
      try {
        await login(foreign, user);
        await foreign.goto(builderOrigin + `/invitations/${id}/rsvps`);
        await expect(
          foreign.getByRole('main').getByRole('alert'),
        ).toContainText(
          user === seed.rsvpOther
            ? 'Không thể hoàn tất yêu cầu'
            : 'chỉ dành cho Customer',
        );
        await expect(
          foreign.getByText('Khách di động', { exact: true }),
        ).toHaveCount(0);
      } finally {
        await foreignContext.close();
      }
    }
  } finally {
    await guestContext.close();
  }
});
