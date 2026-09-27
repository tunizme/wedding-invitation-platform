import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AccessSession,
  UserProfile,
} from '../../src/features/identity-access/api/client';
import { ProfileForm } from '../../src/features/identity-access/forms/profile-form';
import {
  authenticatedRequest,
  clearLocalSession,
} from '../../src/features/identity-access/session/refresh-coordinator';
import { sessionStore } from '../../src/features/identity-access/session/store';

vi.mock(
  '../../src/features/identity-access/session/refresh-coordinator',
  async (original) => ({
    ...(await original<
      typeof import('../../src/features/identity-access/session/refresh-coordinator')
    >()),
    authenticatedRequest: vi.fn(),
    clearLocalSession: vi.fn(() => sessionStore.clear()),
  }),
);

const profile: UserProfile = {
  id: 'b8f83023-4db8-4a4f-88b9-5d78a3eb9581',
  email: 'person@example.test',
  emailVerified: true,
  loginMethod: 'LOCAL',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  displayName: 'Tên cũ',
  phoneNumber: null,
  avatarUrl: null,
};
const session: AccessSession = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'csrf-token',
  user: profile,
};

beforeEach(() => {
  vi.mocked(authenticatedRequest).mockReset();
  vi.mocked(clearLocalSession).mockClear();
  sessionStore.clear();
});
afterEach(() => cleanup());

describe('profile and password UI', () => {
  it('loads the safe profile and submits only editable fields', async () => {
    sessionStore.set(session);
    vi.mocked(authenticatedRequest)
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce({
        ...profile,
        displayName: 'Tên mới',
        phoneNumber: '0909',
      });
    render(<ProfileForm />);

    expect(
      await screen.findByText('Email: person@example.test'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/role|status|identity/i),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tên hiển thị'), {
      target: { value: ' Tên mới ' },
    });
    fireEvent.change(screen.getByLabelText(/Số điện thoại/), {
      target: { value: ' 0909 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

    await waitFor(() =>
      expect(authenticatedRequest).toHaveBeenLastCalledWith('/me', {
        method: 'PATCH',
        body: { displayName: 'Tên mới', phoneNumber: '0909' },
      }),
    );
    expect(
      await screen.findByText(/Số điện thoại chưa được xác minh/),
    ).toBeInTheDocument();
    expect(sessionStore.get()?.user.displayName).toBe('Tên mới');
  });

  it('clears the memory session and requires login after password change', async () => {
    sessionStore.set(session);
    vi.mocked(authenticatedRequest)
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce(undefined);
    render(<ProfileForm />);
    await screen.findByText('Email: person@example.test');
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {
      target: { value: 'Current password' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
      target: { value: 'Replacement password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    await waitFor(() =>
      expect(authenticatedRequest).toHaveBeenLastCalledWith('/me/password', {
        method: 'POST',
        body: {
          currentPassword: 'Current password',
          newPassword: 'Replacement password',
        },
        cookieAuth: true,
      }),
    );
    expect(clearLocalSession).toHaveBeenCalledOnce();
    expect(sessionStore.get()).toBeNull();
    expect(
      await screen.findByText(/Vui lòng đăng nhập lại/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('shows that password change does not apply to social-only accounts', async () => {
    const social = { ...profile, loginMethod: 'GOOGLE' as const };
    sessionStore.set({ ...session, user: social });
    vi.mocked(authenticatedRequest).mockResolvedValueOnce(social);
    render(<ProfileForm />);
    expect(
      await screen.findByText(
        'Tài khoản mạng xã hội không sử dụng mật khẩu LOCAL.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Đổi mật khẩu' }),
    ).not.toBeInTheDocument();
  });
});
