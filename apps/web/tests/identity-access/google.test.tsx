import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../../src/app/(auth)/login/page';
import OAuthResultPage from '../../src/app/(auth)/oauth-result/page';
import { bootstrapSession } from '../../src/features/identity-access/session/refresh-coordinator';
import { sessionStore } from '../../src/features/identity-access/session/store';

vi.mock(
  '../../src/features/identity-access/session/refresh-coordinator',
  () => ({
    bootstrapSession: vi.fn(),
  }),
);

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test/api/v1');
  vi.mocked(bootstrapSession).mockReset();
  sessionStore.clear();
  history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('Google login UI', () => {
  it('offers the fixed backend OAuth start route', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /google/i })).toHaveAttribute(
      'href',
      'https://api.example.test/api/v1/auth/oauth/google/start',
    );
  });

  it('removes callback result data and bootstraps through CSRF plus refresh', async () => {
    history.replaceState(null, '', '/oauth-result?result=success');
    vi.mocked(bootstrapSession).mockResolvedValue({
      accessToken: 'internal-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken: 'csrf',
      user: {
        id: 'user',
        email: 'person@example.test',
        emailVerified: true,
        loginMethod: 'GOOGLE',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        displayName: null,
        phoneNumber: null,
        avatarUrl: null,
      },
    });
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<OAuthResultPage />);
    await screen.findByText(/đăng nhập thành công/i);
    expect(bootstrapSession).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
    expect(document.body.textContent).not.toContain('internal-access-token');
    expect(storage).not.toHaveBeenCalled();
  });

  it('fails safely without bootstrapping for an unknown result', async () => {
    history.replaceState(
      null,
      '',
      '/oauth-result?result=access_token%3Dstolen',
    );
    render(<OAuthResultPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(bootstrapSession).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('stolen');
    expect(window.location.search).toBe('');
  });
});
