import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessSession } from '../../src/features/identity-access/api/client';
import {
  ApiError,
  iamRequest,
} from '../../src/features/identity-access/api/client';
import LoginPage from '../../src/app/(auth)/login/page';
import { sessionStore } from '../../src/features/identity-access/session/store';

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));

const session: AccessSession = {
  accessToken: 'header.payload.signature',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'csrf_0123456789abcdefghijklmnopqrstuvwxyz012',
  user: {
    id: 'b8f83023-4db8-4a4f-88b9-5d78a3eb9581',
    email: 'person@example.test',
    emailVerified: true,
    loginMethod: 'LOCAL',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    displayName: null,
    phoneNumber: null,
    avatarUrl: null,
  },
};

function submit(password = '  Exact Password 🔒  ') {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'person@example.test' },
  });
  fireEvent.change(screen.getByLabelText(/^mật khẩu$/i), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));
}

beforeEach(() => {
  vi.mocked(iamRequest).mockReset();
  sessionStore.clear();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LOCAL login UI and memory-only session', () => {
  it('preserves the password, requests cookie credentials and stores the session only in memory', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    vi.mocked(iamRequest).mockResolvedValue(session);
    render(<LoginPage />);
    submit();
    await screen.findByText(/person@example\.test/);
    expect(iamRequest).toHaveBeenCalledWith(
      '/auth/login',
      expect.objectContaining({
        method: 'POST',
        cookieAuth: true,
        body: {
          email: 'person@example.test',
          password: '  Exact Password 🔒  ',
        },
      }),
    );
    expect(sessionStore.get()).toEqual(session);
    expect(storage).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.href).not.toContain(session.accessToken);
    expect(document.body.textContent).not.toContain(session.accessToken);
    expect(screen.queryByLabelText(/^mật khẩu$/i)).not.toBeInTheDocument();
  });

  it('prevents duplicate submission and leaves the previous session untouched on failure', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(iamRequest).mockImplementation(
      () => new Promise((_, fail) => (reject = fail)),
    );
    sessionStore.set(session);
    render(<LoginPage />);
    submit();
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(iamRequest).toHaveBeenCalledTimes(1);
    reject(new ApiError(401));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /email hoặc mật khẩu/i,
      ),
    );
    expect(sessionStore.get()).toEqual(session);
    expect(button).toBeEnabled();
  });

  it('shows verification guidance only for the server 403 response', async () => {
    vi.mocked(iamRequest).mockRejectedValue(new ApiError(403));
    render(<LoginPage />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /xác minh email/i,
    );
    expect(
      screen.getByRole('link', { name: /gửi lại email/i }),
    ).toHaveAttribute('href', '/verify-email');
  });

  it.each([
    [429, /thao tác quá nhanh/i],
    [0, /không thể kết nối/i],
  ])('shows a safe error for status %s', async (status, message) => {
    vi.mocked(iamRequest).mockRejectedValue(new ApiError(status));
    render(<LoginPage />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(document.body.textContent).not.toContain('Exact Password');
  });

  it('offers registration and password recovery from the login screen', async () => {
    render(<LoginPage />);
    expect(
      screen.getByRole('link', { name: /quên mật khẩu/i }),
    ).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: /đăng ký/i })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
