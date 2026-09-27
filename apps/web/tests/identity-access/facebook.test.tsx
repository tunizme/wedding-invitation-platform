import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../../src/app/(auth)/login/page';
import OAuthResultPage from '../../src/app/(auth)/oauth-result/page';
import SocialOnboardingPage from '../../src/app/(auth)/social-onboarding/page';
import { iamRequest } from '../../src/features/identity-access/api/client';
import { bootstrapSession } from '../../src/features/identity-access/session/refresh-coordinator';

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));
vi.mock(
  '../../src/features/identity-access/session/refresh-coordinator',
  () => ({ bootstrapSession: vi.fn() }),
);

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test/api/v1');
  vi.mocked(bootstrapSession).mockReset();
  vi.mocked(iamRequest).mockReset();
  history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('Facebook login UI', () => {
  it('offers the fixed backend Facebook start route alongside Google', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /facebook/i })).toHaveAttribute(
      'href',
      'https://api.example.test/api/v1/auth/oauth/facebook/start',
    );
    expect(screen.getByRole('link', { name: /google/i })).toBeInTheDocument();
  });

  it('bootstraps the direct Facebook result into an in-memory session', async () => {
    history.replaceState(null, '', '/oauth-result?result=success');
    vi.mocked(bootstrapSession).mockResolvedValue({
      accessToken: 'facebook-internal-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken: 'csrf',
      user: {
        id: 'facebook-user',
        email: 'person@example.test',
        emailVerified: true,
        loginMethod: 'FACEBOOK',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        displayName: null,
        phoneNumber: null,
        avatarUrl: null,
      },
    });
    render(<OAuthResultPage />);
    await screen.findByText(/đăng nhập thành công/i);
    expect(bootstrapSession).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
    expect(document.body.textContent).not.toContain(
      'facebook-internal-access-token',
    );
  });

  it('renders onboarding only for the missing-email fallback context', async () => {
    vi.mocked(iamRequest).mockResolvedValue({
      provider: 'FACEBOOK',
      status: 'PENDING_EMAIL',
      emailCandidate: null,
      expiresAt: '2026-09-27T12:00:00.000Z',
      csrfToken: 'csrf',
    });
    render(<SocialOnboardingPage />);
    expect(await screen.findByLabelText(/email/i)).toHaveValue('');
    expect(iamRequest).toHaveBeenCalledWith('/auth/social-onboarding', {
      cookieAuth: true,
    });
    expect(document.body.textContent).not.toContain('csrf');
  });

  it('fails safely for rejected callbacks without session bootstrap', async () => {
    history.replaceState(null, '', '/oauth-result?result=denied');
    render(<OAuthResultPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(bootstrapSession).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });
});
