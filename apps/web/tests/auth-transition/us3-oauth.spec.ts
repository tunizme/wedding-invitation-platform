import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { expect, test } from './support/fixtures';
import {
  env,
  loginViaUi,
  principalAfterReload,
  seedUser,
  stackReady,
  startProxy,
} from './support/stack';
import type { DeliveryProxy } from './support/delivery-proxy';

test.skip(!stackReady, 'Requires the owned OAuth harness stack');

let proxy: DeliveryProxy;
test.beforeAll(async () => {
  proxy = await startProxy();
});
test.afterAll(async () => proxy?.close());
test.afterEach(({ context }) => {
  proxy?.clearHolds();
  return context.clearCookies();
});

async function startOAuth(page: Page) {
  await page.goto(`${env.webUrl}/login`);
  const action = page.getByRole('button', { name: 'Tiếp tục với Google' });
  await expect(action).toBeEnabled();
  await action.click();
  await expect(page).toHaveURL(/\/authorize\?/);
  const url = new URL(page.url());
  return url.searchParams.get('state') ?? '';
}

async function registerIdentity(
  code: string,
  subject: string,
  email: string,
  emailVerified = true,
) {
  const response = await fetch(`${env.providerUrl}/identities`, {
    method: 'POST',
    body: JSON.stringify({
      code,
      identity: {
        provider: 'GOOGLE',
        subject,
        email,
        emailVerified,
        displayName: 'OAuth Browser User',
        avatarUrl: null,
      },
    }),
  });
  expect(response.status).toBe(204);
}

async function callback(page: Page, state: string, code: string) {
  return page.goto(
    `${env.apiUrl}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
  );
}

async function callbackRequest(page: Page, state: string, code: string) {
  return page.request.get(
    `${env.apiUrl}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
    { maxRedirects: 0 },
  );
}

test('B12: a callback arriving after a newer local login cannot admit the old OAuth account', async ({
  context,
}) => {
  const page = await context.newPage();
  const state = await startOAuth(page);
  const newer = await seedUser('b12-newer');
  const secondTab = await context.newPage();
  await loginViaUi(secondTab, newer);
  const suffix = randomUUID();
  const code = `b12-late-${suffix}`;
  await registerIdentity(
    code,
    `b12-late-subject-${suffix}`,
    `${code}@example.test`,
  );
  await callback(page, state, code);
  await expect(page.getByText(/được thay thế/i)).toBeVisible();
  expect(await principalAfterReload(secondTab)).toBe(newer);
  expect(await principalAfterReload(page)).toBe(newer);
});

test('B12: a returning provider identity establishes and renews a protocol-2 session', async ({
  context,
}) => {
  const page = await context.newPage();
  const state = await startOAuth(page);
  const suffix = randomUUID();
  const code = `b12-returning-${suffix}`;
  const email = `${code}@example.test`;
  await registerIdentity(code, `b12-returning-subject-${suffix}`, email);
  await callback(page, state, code);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  expect(await principalAfterReload(page)).toBe(email);
});

test('B12: a first-time unverified identity completes onboarding under a fresh intent', async ({
  context,
}) => {
  const page = await context.newPage();
  const state = await startOAuth(page);
  const suffix = randomUUID();
  const code = `b12-onboarding-${suffix}`;
  const email = `${code}@example.test`;
  await registerIdentity(
    code,
    `b12-onboarding-subject-${suffix}`,
    email,
    false,
  );
  await callback(page, state, code);
  await expect(
    page.getByRole('heading', { name: 'Hoàn tất đăng ký' }),
  ).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Gửi email xác minh' }).click();
  await expect(
    page.getByText('Đã gửi hướng dẫn xác minh email.'),
  ).toBeVisible();
  const proofResponse = await fetch(`${env.providerUrl}/social-proof`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  expect(proofResponse.status).toBe(200);
  const { proof } = (await proofResponse.json()) as { proof: string };
  await page.goto(
    `${env.webUrl}/social-onboarding#token=${encodeURIComponent(proof)}`,
  );
  await page.getByRole('button', { name: 'Hoàn tất xác minh' }).click();
  await expect(page.getByText(/Đã đăng nhập với/)).toBeVisible();
  expect(await principalAfterReload(page)).toBe(email);
});

test('B13: a late reserve response for OAuth A cannot launch after OAuth B reserved', async ({
  context,
}) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto(`${env.webUrl}/login`);
  await second.goto(`${env.webUrl}/login`);
  proxy.hold({
    method: 'POST',
    path: /^\/api\/v1\/auth\/contexts\/[^/]+\/intents$/,
    times: 1,
  });
  await first.getByRole('button', { name: 'Tiếp tục với Google' }).click();
  const held = await proxy.nextHeld({
    path: /^\/api\/v1\/auth\/contexts\/[^/]+\/intents$/,
  });
  await held.committed;
  await second.getByRole('button', { name: 'Tiếp tục với Google' }).click();
  await expect(second).toHaveURL(/\/authorize\?/);
  const stateB = new URL(second.url()).searchParams.get('state') ?? '';
  await held.release();
  await expect(first).toHaveURL(/\/login/);
  const suffix = randomUUID();
  const code = `b13-oauth-b-${suffix}`;
  const email = `${code}@example.test`;
  await registerIdentity(code, `b13-oauth-b-subject-${suffix}`, email);
  await callback(second, stateB, code);
  await expect(second.getByText('Đăng nhập thành công')).toBeVisible();
  expect(await principalAfterReload(second)).toBe(email);
});

test('B12: invalid and reused OAuth state never establishes an extra account', async ({
  context,
}) => {
  const page = await context.newPage();
  const invalidState = await startOAuth(page);
  // Bad-request callback responses are asserted through the context-bound API
  // client; Firefox may reject an HTTP problem response as a navigation error.
  const invalid = await callbackRequest(
    page,
    `${invalidState}-invalid`,
    'unused',
  );
  expect(invalid?.status()).toBe(400);
  expect(await principalAfterReload(page)).toBeNull();

  const state = await startOAuth(page);
  const suffix = randomUUID();
  const code = `b12-reused-state-${suffix}`;
  const email = `${code}@example.test`;
  await registerIdentity(code, `b12-reused-subject-${suffix}`, email);
  await callback(page, state, code);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  expect(await principalAfterReload(page)).toBe(email);

  const replay = await callbackRequest(page, state, code);
  expect(replay.status()).toBeGreaterThanOrEqual(400);
  expect(await principalAfterReload(page)).toBe(email);
});

test('B12: logout supersedes an in-flight OAuth callback without restoring the account', async ({
  context,
}) => {
  const current = await seedUser('b12-logout-current');
  const page = await context.newPage();
  await loginViaUi(page, current);
  const oauthPage = await context.newPage();
  const state = await startOAuth(oauthPage);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toHaveCount(0);

  const suffix = randomUUID();
  const code = `b12-after-logout-${suffix}`;
  await registerIdentity(
    code,
    `b12-after-logout-subject-${suffix}`,
    `${code}@example.test`,
  );
  await callback(oauthPage, state, code);
  await expect(oauthPage.getByText(/được thay thế/i)).toBeVisible();
  expect(await principalAfterReload(page)).toBeNull();
  expect(await principalAfterReload(oauthPage)).toBeNull();
});

for (const stage of ['confirm', 'refresh'] as const) {
  test(`B12: OAuth result superseded during ${stage} preserves newer login through reload and renew`, async ({
    context,
  }) => {
    const oauth = await context.newPage();
    const state = await startOAuth(oauth);
    const suffix = randomUUID();
    const code = `phase22-oauth-${stage}-${suffix}`;
    await registerIdentity(
      code,
      `phase22-subject-${suffix}`,
      `${code}@example.test`,
    );
    const path =
      stage === 'confirm'
        ? /^\/api\/v1\/auth\/contexts\/[^/]+\/confirm$/
        : /^\/api\/v1\/auth\/refresh$/;
    proxy.hold({ method: 'POST', path, times: 1 });
    const navigating = callback(oauth, state, code);
    const held = await proxy.nextHeld({ path });
    await held.committed;
    expect(held.status).toBe(200);
    const newer = await seedUser(`phase22-oauth-${stage}-b`);
    const other = await context.newPage();
    await loginViaUi(other, newer);
    await held.release();
    await navigating;
    await expect(oauth.getByText(/đã được thay thế/)).toBeVisible();
    await expect(
      oauth.getByText('Đăng nhập thành công.', { exact: true }),
    ).toHaveCount(0);
    expect(await principalAfterReload(other)).toBe(newer);
    expect(await principalAfterReload(oauth)).toBe(newer);
  });
}
