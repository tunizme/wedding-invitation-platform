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
  type AccessSession,
  type UserProfile,
} from '../../src/features/identity-access/api/client';
import { AccountWorkspace } from '../../src/ui/product/account-workspace';
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
        scope: expect.objectContaining({ resource: 'ProfileForm' }),
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
    render(
      <AccountWorkspace>
        <ProfileForm />
      </AccountWorkspace>,
    );
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
        scope: expect.objectContaining({ resource: 'ProfileForm' }),
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
    expect(
      screen.queryByText(profile.email, { exact: true }),
    ).not.toBeInTheDocument();
    const nextProfile = { ...profile, id: 'user-b', email: 'b@example.test' };
    vi.mocked(authenticatedRequest).mockResolvedValueOnce(nextProfile);
    act(() => sessionStore.set({ ...session, user: nextProfile }));
    expect(
      await screen.findByText('Email: b@example.test'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Vui lòng đăng nhập lại/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/person@example.test/)).not.toBeInTheDocument();
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

  describe('owner lifetime (005 US1)', () => {
    const fillPassword = async () => {
      render(<ProfileForm />);
      await screen.findByText('Email: person@example.test');
      fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {
        target: { value: 'Current password' },
      });
      fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
        target: { value: 'Replacement password' },
      });
    };

    it('loads the profile with a captured owner scope', async () => {
      sessionStore.set(session);
      vi.mocked(authenticatedRequest).mockResolvedValueOnce(profile);
      render(<ProfileForm />);
      await screen.findByText('Email: person@example.test');
      expect(authenticatedRequest).toHaveBeenCalledWith('/me', {
        scope: expect.objectContaining({ resource: 'ProfileForm' }),
      });
    });

    it('ignores a stale profile PATCH of A after B is admitted', async () => {
      sessionStore.set(session);
      // After B is admitted the remounted form loads B's own profile.
      vi.mocked(authenticatedRequest).mockResolvedValue({
        ...profile,
        id: 'user-b',
        email: 'b@example.test',
      });
      let resolvePatch!: (value: UserProfile) => void;
      vi.mocked(authenticatedRequest)
        .mockResolvedValueOnce(profile)
        .mockImplementationOnce(
          () => new Promise((done) => (resolvePatch = done)),
        );
      render(<ProfileForm />);
      await screen.findByText('Email: person@example.test');
      fireEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
      await waitFor(() =>
        expect(authenticatedRequest).toHaveBeenCalledTimes(2),
      );
      const userB = { ...profile, id: 'user-b', email: 'b@example.test' };
      act(() => sessionStore.set({ ...session, user: userB }));
      await act(async () =>
        resolvePatch({ ...profile, displayName: 'Private A edit' }),
      );
      expect(sessionStore.get()?.user.id).toBe('user-b');
      expect(sessionStore.get()?.user.displayName).not.toBe('Private A edit');
      expect(screen.queryByText(/Đã cập nhật hồ sơ/)).toBeNull();
    });

    it('keeps the session and never claims success when the password response is uncertain', async () => {
      sessionStore.set(session);
      vi.mocked(authenticatedRequest)
        .mockResolvedValueOnce(profile)
        .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'UNCERTAIN'));
      await fillPassword();
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
      await screen.findByRole('alert');
      expect(clearLocalSession).not.toHaveBeenCalled();
      expect(sessionStore.get()).not.toBeNull();
      expect(screen.queryByText(/Vui lòng đăng nhập lại/)).toBeNull();
      // The mutation is never replayed automatically.
      expect(
        vi
          .mocked(authenticatedRequest)
          .mock.calls.filter(([path]) => path === '/me/password'),
      ).toHaveLength(1);
    });

    it('treats a parsed server rejection as COMPLETED, not as a password change', async () => {
      sessionStore.set(session);
      vi.mocked(authenticatedRequest)
        .mockResolvedValueOnce(profile)
        .mockRejectedValueOnce(new ApiError(400, 'INVALID', 'COMPLETED'));
      await fillPassword();
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(clearLocalSession).not.toHaveBeenCalled();
      expect(sessionStore.get()).not.toBeNull();
      expect(screen.queryByText('Mật khẩu hiện tại không đúng.')).toBeNull();
    });
    it('preserves generic400 recovery and only explains an explicit social-only rejection', async () => {
      sessionStore.set(session);
      vi.mocked(authenticatedRequest)
        .mockResolvedValueOnce(profile)
        .mockRejectedValueOnce(new ApiError(400));
      await fillPassword();
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
      const general = await screen.findByRole('alert');
      expect(general).not.toHaveTextContent('Mật khẩu hiện tại không đúng.');
      expect(screen.getByLabelText('Mật khẩu hiện tại')).not.toHaveAttribute(
        'aria-invalid',
        'true',
      );
      vi.mocked(authenticatedRequest).mockRejectedValueOnce(
        new ApiError(400, 'PASSWORD_CHANGE_NOT_APPLICABLE'),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Tài khoản mạng xã hội không sử dụng mật khẩu LOCAL.',
        ),
      );
      expect(clearLocalSession).not.toHaveBeenCalled();
    });

    it('does not clear B when a late password completion of A arrives', async () => {
      sessionStore.set(session);
      // After B is admitted the remounted form loads B's own profile.
      vi.mocked(authenticatedRequest).mockResolvedValue({
        ...profile,
        id: 'user-b',
        email: 'b@example.test',
      });
      let resolvePassword!: (value: undefined) => void;
      vi.mocked(authenticatedRequest)
        .mockResolvedValueOnce(profile)
        .mockImplementationOnce(
          () => new Promise((done) => (resolvePassword = done)),
        );
      await fillPassword();
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
      await waitFor(() =>
        expect(authenticatedRequest).toHaveBeenCalledTimes(2),
      );
      const userB = { ...profile, id: 'user-b', email: 'b@example.test' };
      act(() => sessionStore.set({ ...session, user: userB }));
      await act(async () => resolvePassword(undefined));
      expect(clearLocalSession).not.toHaveBeenCalled();
      expect(sessionStore.get()?.user.id).toBe('user-b');
    });
  });
});
