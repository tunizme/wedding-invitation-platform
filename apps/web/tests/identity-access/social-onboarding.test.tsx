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
import SocialOnboardingPage from '../../src/app/(auth)/social-onboarding/page';
import { sessionStore } from '../../src/features/identity-access/session/store';

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));

const state = {
  provider: 'FACEBOOK',
  status: 'PENDING_EMAIL',
  emailCandidate: null,
  expiresAt: '2026-09-26T15:30:00.000Z',
  csrfToken: 'csrf-onboarding',
};
const session: AccessSession = {
  accessToken: 'social-access',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'session-csrf',
  user: {
    id: 'b8f83023-4db8-4a4f-88b9-5d78a3eb9581',
    email: 'social@example.test',
    emailVerified: true,
    loginMethod: 'FACEBOOK',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    displayName: null,
    phoneNumber: null,
    avatarUrl: null,
  },
};

beforeEach(() => {
  vi.mocked(iamRequest).mockReset();
  sessionStore.clear();
  window.history.replaceState(null, '', '/social-onboarding');
});
afterEach(() => cleanup());

describe('social onboarding UI', () => {
  it('collects email, requests verification and supports explicit resend', async () => {
    vi.mocked(iamRequest)
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce({ message: 'accepted' })
      .mockResolvedValueOnce({ message: 'accepted' });
    render(<SocialOnboardingPage />);
    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: ' social@example.test ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /gửi email xác minh/i }),
    );
    await screen.findByText(/đã gửi hướng dẫn/i);
    expect(iamRequest).toHaveBeenNthCalledWith(
      2,
      '/auth/social-onboarding/email',
      expect.objectContaining({
        method: 'POST',
        cookieAuth: true,
        csrfToken: state.csrfToken,
        body: { email: 'social@example.test' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /gửi lại/i }));
    await waitFor(() => expect(iamRequest).toHaveBeenCalledTimes(3));
  });

  it('reads proof from the fragment, clears it and stores successful session in memory', async () => {
    window.history.replaceState(
      null,
      '',
      '/social-onboarding#token=proof-value',
    );
    vi.mocked(iamRequest)
      .mockResolvedValueOnce({ ...state, status: 'PENDING_VERIFICATION' })
      .mockResolvedValueOnce(session);
    render(<SocialOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: /hoàn tất/i }));
    await screen.findByText(/social@example\.test/i);
    expect(window.location.hash).toBe('');
    expect(sessionStore.get()).toEqual(session);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.body.textContent).not.toContain(session.accessToken);
  });

  it.each([401, 409])(
    'requires a fresh provider login after status %s',
    async (status) => {
      vi.mocked(iamRequest).mockRejectedValue(new ApiError(status));
      render(<SocialOnboardingPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /đăng nhập lại/i,
      );
      expect(
        screen.getByRole('link', { name: /bắt đầu lại/i }),
      ).toHaveAttribute('href', '/login');
      expect(iamRequest).toHaveBeenCalledTimes(1);
    },
  );

  it('does not automatically retry a rejected old proof or binding', async () => {
    window.history.replaceState(null, '', '/social-onboarding#token=old-proof');
    vi.mocked(iamRequest)
      .mockResolvedValueOnce({ ...state, status: 'PENDING_VERIFICATION' })
      .mockRejectedValueOnce(new ApiError(400));
    render(<SocialOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: /hoàn tất/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không còn hiệu lực/i,
    );
    expect(iamRequest).toHaveBeenCalledTimes(2);
  });
});
