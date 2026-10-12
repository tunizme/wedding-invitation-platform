import {
  act,
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
import SocialOnboardingPage from '../../src/app/(product)/(auth)/social-onboarding/page';
import { sessionStore } from '../../src/features/identity-access/session/store';
import {
  CONTEXT_ID,
  INTENT_ID,
  installSelectedSelector,
  protocolSession,
} from './auth-protocol-mock';

// 006 T062 (FR-003/FR-014): completion uses the selected context and a
// reserved onboarding intent; proof handling and memory-only admission remain.

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));

const state = {
  contextId: CONTEXT_ID,
  provider: 'FACEBOOK',
  status: 'PENDING_EMAIL',
  emailCandidate: null,
  expiresAt: '2026-09-26T15:30:00.000Z',
  csrfToken: 'csrf-onboarding',
};
const session: AccessSession = protocolSession({
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
});

const reserved = {
  authProtocol: 2,
  intentId: INTENT_ID,
  kind: 'ONBOARDING_COMPLETE',
  revision: 1,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

beforeEach(async () => {
  vi.mocked(iamRequest).mockReset();
  sessionStore.clear();
  await installSelectedSelector(0);
  window.history.replaceState(null, '', '/social-onboarding');
});
afterEach(() => cleanup());

describe('social onboarding UI', () => {
  it('announces loading while the onboarding state is pending', () => {
    vi.mocked(iamRequest).mockImplementation(() => new Promise(() => {}));
    render(<SocialOnboardingPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
  });
  it('never reports a stale confirmation as the newer account success', async () => {
    window.history.replaceState(null, '', '/social-onboarding#token=proof-A');
    let finish!: (value: AccessSession) => void;
    vi.mocked(iamRequest)
      .mockResolvedValueOnce({ ...state, status: 'PENDING_VERIFICATION' })
      .mockResolvedValueOnce(reserved)
      .mockImplementationOnce(
        () =>
          new Promise<AccessSession>((done) => {
            finish = done;
          }),
      );
    render(<SocialOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: /hoàn tất/i }));
    await waitFor(() => expect(finish).toBeDefined());
    const b = {
      ...session,
      user: { ...session.user, id: 'account-B', email: 'b@example.test' },
    };
    act(() => sessionStore.set(b));
    await act(async () => finish(session));
    expect(sessionStore.get()?.user.id).toBe('account-B');
    expect(screen.queryByText(/Đã đăng nhập với/)).toBeNull();
  });
  it('discards a delayed onboarding state after a newer account is admitted', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(iamRequest).mockImplementation(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    render(<SocialOnboardingPage />);
    const finishA = finish;
    const b = { ...session, user: { ...session.user, id: 'account-B' } };
    act(() => sessionStore.set(b));
    await act(async () =>
      finishA({ ...state, emailCandidate: 'private-A@example.test' }),
    );
    expect(sessionStore.get()?.user.id).toBe('account-B');
    expect(screen.queryByDisplayValue('private-A@example.test')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /gửi email xác minh/i }),
    ).toBeNull();
  });
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
      .mockResolvedValueOnce(reserved)
      .mockResolvedValueOnce(session);
    render(<SocialOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: /hoàn tất/i }));
    await screen.findByText(/social@example\.test/i);
    expect(screen.getByRole('status')).toHaveTextContent('Đã đăng nhập với');
    expect(
      screen.getByRole('link', { name: 'Đi đến tài khoản' }),
    ).toHaveAttribute('href', '/account');
    expect(window.location.hash).toBe('');
    expect(iamRequest).toHaveBeenCalledWith(
      `/auth/contexts/${CONTEXT_ID}/intents`,
      expect.objectContaining({
        body: { kind: 'ONBOARDING_COMPLETE', expectedRevision: 0 },
      }),
    );
    expect(iamRequest).toHaveBeenCalledWith(
      '/auth/social-onboarding/verifications/confirm',
      expect.objectContaining({
        body: { proof: 'proof-value' },
        auth: { contextId: CONTEXT_ID, intentId: INTENT_ID },
        expectProtocol: true,
      }),
    );
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
      .mockResolvedValueOnce(reserved)
      .mockRejectedValueOnce(new ApiError(400));
    render(<SocialOnboardingPage />);
    fireEvent.click(await screen.findByRole('button', { name: /hoàn tất/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không còn hiệu lực/i,
    );
    expect(iamRequest).toHaveBeenCalledTimes(3);
    expect(
      vi
        .mocked(iamRequest)
        .mock.calls.filter(
          ([path]) => path === '/auth/social-onboarding/verifications/confirm',
        ),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /hoàn tất/i }),
    ).not.toBeInTheDocument();
  });
});
