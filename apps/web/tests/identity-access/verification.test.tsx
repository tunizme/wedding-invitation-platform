import { StrictMode, type ComponentType } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  iamRequest,
} from '../../src/features/identity-access/api/client';

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));
const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

// Discover real pages without unresolved imports while T038 is unimplemented.
// Every test fails explicitly if its page is absent; no skip, mock page or fallback.
const pages = import.meta.glob('../../src/app/**/page.tsx') as Record<
  string,
  () => Promise<{ default: ComponentType }>
>;
type Route = 'verify-email' | 'forgot-password' | 'reset-password';
const proof = 'synthetic_proof_0123456789abcdefghijklmnopqrstuv';
const password = '  Replacement password 🔒  ';

async function mount(route: Route, suffix = '', strict = false) {
  window.history.replaceState(null, '', `/${route}${suffix}`);
  const load = pages[`../../src/app/(auth)/${route}/page.tsx`];
  expect(load, `T038 page /${route} must exist`).toBeTypeOf('function');
  const { default: Page } = await load();
  const rendered = render(
    strict ? (
      <StrictMode>
        <Page />
      </StrictMode>
    ) : (
      <Page />
    ),
  );
  await waitFor(() =>
    expect(
      screen.queryByText('Đang kiểm tra liên kết…'),
    ).not.toBeInTheDocument(),
  );
  return rendered;
}
function fillEmail() {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'person@example.test' },
  });
}
function fillPassword() {
  fireEvent.change(screen.getByLabelText(/^mật khẩu mới$/i), {
    target: { value: password },
  });
  const confirmation = screen.queryByLabelText(
    /^(xác nhận|nhập lại) mật khẩu/i,
  );
  if (confirmation)
    fireEvent.change(confirmation, { target: { value: password } });
}
async function confirmEmail() {
  // Supports automatic verification or an explicit confirmation button.
  await waitFor(() =>
    expect(
      vi
        .mocked(iamRequest)
        .mock.calls.some(
          ([path]) => path === '/auth/email-verifications/confirm',
        ) ||
        screen.queryByRole('button', { name: /xác (nhận|minh) email/i }) !==
          null,
    ).toBe(true),
  );
  const button = screen.queryByRole('button', {
    name: /xác (nhận|minh) email/i,
  });
  if (button && !vi.mocked(iamRequest).mock.calls.length)
    fireEvent.click(button);
}
function noSessionSideEffects() {
  expect(iamRequest).not.toHaveBeenCalledWith('/auth/login', expect.anything());
  expect(iamRequest).not.toHaveBeenCalledWith(
    '/auth/refresh',
    expect.anything(),
  );
  expect(navigation.push).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.refresh).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
}

beforeEach(() => {
  vi.mocked(iamRequest).mockReset();
  vi.mocked(iamRequest).mockResolvedValue(undefined);
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('US2 verification and recovery UI', () => {
  it('extracts and removes the verification fragment before submitting proof in the POST body', async () => {
    vi.mocked(iamRequest).mockImplementation(async () => {
      expect(window.location.hash).toBe('');
      return undefined;
    });
    await mount('verify-email', `#token=${encodeURIComponent(proof)}`);
    await confirmEmail();
    await waitFor(() =>
      expect(iamRequest).toHaveBeenCalledWith(
        '/auth/email-verifications/confirm',
        expect.objectContaining({ method: 'POST', body: { proof } }),
      ),
    );
    expect(window.location.href).not.toContain(proof);
    expect(document.body.textContent).not.toContain(proof);
    expect(
      await screen.findByRole('link', { name: /đăng nhập/i }),
    ).toHaveAttribute('href', '/login');
    noSessionSideEffects();
  });

  it('does not submit verification twice under StrictMode effect replay', async () => {
    await mount('verify-email', `#token=${proof}`, true);
    await confirmEmail();
    await screen.findByRole('link', { name: /đăng nhập/i });
    expect(
      vi
        .mocked(iamRequest)
        .mock.calls.filter(
          ([path]) => path === '/auth/email-verifications/confirm',
        ),
    ).toHaveLength(1);
  });

  for (const route of ['verify-email', 'reset-password'] as const) {
    it.each(['', '?token=query-must-not-be-used', '#token=', '#token=short'])(
      `${route} handles missing or malformed fragment (%s) without submitting a proof`,
      async (suffix) => {
        await mount(route, suffix);
        expect(await screen.findByRole('alert')).toHaveTextContent(
          /không hợp lệ|thiếu|hết hạn/i,
        );
        expect(iamRequest).not.toHaveBeenCalled();
        expect(window.location.hash).toBe('');
        noSessionSideEffects();
      },
    );
  }

  it('shows an invalid/expired verification error and offers resend', async () => {
    vi.mocked(iamRequest).mockRejectedValue(new ApiError(400));
    await mount('verify-email', `#token=${proof}`);
    await confirmEmail();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không hợp lệ|hết hạn/i,
    );
    expect(screen.getByRole('button', { name: /gửi lại/i })).toBeEnabled();
    expect(document.body.textContent).not.toContain(proof);
    noSessionSideEffects();
  });

  for (const flow of [
    {
      route: 'verify-email',
      endpoint: '/auth/email-verifications',
      button: /gửi lại/i,
    },
    {
      route: 'forgot-password',
      endpoint: '/auth/password-resets',
      button: /gửi|khôi phục/i,
    },
  ] as const) {
    it(`${flow.route} sends email and displays non-enumerating instructions`, async () => {
      vi.mocked(iamRequest).mockResolvedValue({
        message:
          'If the request is eligible, follow the instructions sent to the email address.',
      });
      await mount(flow.route);
      fillEmail();
      fireEvent.click(screen.getByRole('button', { name: flow.button }));
      await screen.findByText(/Nếu yêu cầu hợp lệ/i);
      expect(iamRequest).toHaveBeenCalledWith(
        flow.endpoint,
        expect.objectContaining({
          method: 'POST',
          body: { email: 'person@example.test' },
        }),
      );
      expect(document.body.textContent).not.toMatch(
        /tài khoản không tồn tại|email chưa đăng ký/i,
      );
      noSessionSideEffects();
    });

    it(`${flow.route} prevents duplicate requests and permits retry after rate limiting`, async () => {
      let reject!: (reason: Error) => void;
      vi.mocked(iamRequest).mockImplementation(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      );
      await mount(flow.route);
      fillEmail();
      const button = screen.getByRole('button', { name: flow.button });
      fireEvent.click(button);
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(iamRequest).toHaveBeenCalledTimes(1);
      await act(async () => reject(new ApiError(429)));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Bạn thao tác quá nhanh',
        ),
      );
      expect(button).toBeEnabled();
      vi.mocked(iamRequest).mockResolvedValue({ message: 'accepted' });
      fireEvent.click(button);
      await screen.findByText(/Nếu yêu cầu hợp lệ/i);
      expect(iamRequest).toHaveBeenCalledTimes(2);
    });
  }

  it('keeps reset proof only in memory after clearing the fragment, preserves password and requires login after success', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    await mount('reset-password', `#token=${encodeURIComponent(proof)}`);
    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(iamRequest).not.toHaveBeenCalled();
    fillPassword();
    fireEvent.click(
      screen.getByRole('button', { name: /đặt lại|đổi mật khẩu/i }),
    );
    await waitFor(() =>
      expect(iamRequest).toHaveBeenCalledWith(
        '/auth/password-resets/confirm',
        expect.objectContaining({
          method: 'POST',
          body: { proof, newPassword: password },
        }),
      ),
    );
    expect(
      await screen.findByRole('link', { name: /đăng nhập/i }),
    ).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText(/^mật khẩu mới$/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(proof);
    expect(window.location.href).not.toContain(proof);
    expect(storage).not.toHaveBeenCalled();
    noSessionSideEffects();
  });

  it('prevents duplicate reset submissions and does not auto-retry failed proof consumption', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(iamRequest).mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await mount('reset-password', `#token=${proof}`);
    fillPassword();
    const button = screen.getByRole('button', {
      name: /đặt lại|đổi mật khẩu/i,
    });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(iamRequest).toHaveBeenCalledTimes(1);
    await act(async () => reject(new ApiError(400)));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không hợp lệ|hết hạn/i,
    );
    expect(
      screen.getByRole('link', { name: /quên mật khẩu|yêu cầu.*mới|gửi lại/i }),
    ).toHaveAttribute('href', '/forgot-password');
    expect(iamRequest).toHaveBeenCalledTimes(1);
    noSessionSideEffects();
  });

  it('shows a safe network error without exposing proof or password', async () => {
    vi.mocked(iamRequest).mockRejectedValue(new ApiError(0));
    await mount('reset-password', `#token=${proof}`);
    fillPassword();
    fireEvent.click(
      screen.getByRole('button', { name: /đặt lại|đổi mật khẩu/i }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể kết nối máy chủ',
    );
    expect(document.body.textContent).not.toContain(proof);
    expect(document.body.textContent).not.toContain(password);
    noSessionSideEffects();
  });
});
