import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SocialLoginButtons } from '../../src/features/identity-access/forms/social-login-buttons';
import LoginPage from '../../src/app/(product)/(auth)/login/page';
import OAuthResultPage from '../../src/app/(product)/(auth)/oauth-result/page';
import {
  beginIntent,
  markIntentReserved,
  readSelector,
} from '../../src/features/identity-access/session/auth-selector';
import {
  CONTEXT_ID,
  INTENT_ID,
  TAG,
  installSelectedSelector,
  protocolSession,
} from './auth-protocol-mock';
import { iamRequest } from '../../src/features/identity-access/api/client';
import { sessionStore } from '../../src/features/identity-access/session/store';

vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test/api/v1');
  vi.mocked(iamRequest).mockReset();
  sessionStore.clear();
  history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Google login UI', () => {
  it('offers the fixed backend OAuth start route', async () => {
    // SSR actions cannot accept a click before hydration installs handlers.
    expect(
      renderToString(<SocialLoginButtons />).match(/disabled=""/g),
    ).toHaveLength(2);
    const store = await installSelectedSelector();
    vi.mocked(iamRequest).mockResolvedValue({
      authProtocol: 2,
      intentId: INTENT_ID,
      revision: 2,
    });
    const assign = vi.fn();
    const testWindow = Object.create(window) as Window;
    Object.defineProperty(testWindow, 'location', { value: { assign } });
    vi.stubGlobal('window', testWindow);
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /google/i }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        `https://api.example.test/api/v1/auth/oauth/google/start?intent=${INTENT_ID}`,
      ),
    );
    expect(iamRequest).toHaveBeenCalledWith(
      `/auth/contexts/${CONTEXT_ID}/intents`,
      {
        method: 'POST',
        cookieAuth: true,
        auth: { contextId: CONTEXT_ID },
        body: { kind: 'OAUTH', expectedRevision: 1 },
        expectProtocol: true,
      },
    );
    expect((await readSelector(store)).pendingIntent).toMatchObject({
      kind: 'OAUTH',
      intentId: INTENT_ID,
    });
  });

  it('removes callback result data and bootstraps through CSRF plus refresh', async () => {
    const store = await installSelectedSelector();
    const attempt = await beginIntent(store, 'OAUTH');
    await markIntentReserved(store, attempt.attemptId, INTENT_ID, 2);
    history.replaceState(
      null,
      '',
      `/oauth-result?result=success&intent=${INTENT_ID}`,
    );
    const session = protocolSession(
      {
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
      },
      { contextRevision: 2 },
    );
    vi.mocked(iamRequest).mockImplementation((path: string) => {
      if (path === `/auth/contexts/${CONTEXT_ID}/confirm`)
        return Promise.resolve({
          authProtocol: 2,
          contextId: CONTEXT_ID,
          revision: 2,
          sessionTag: TAG,
        });
      if (path === '/auth/csrf') return Promise.resolve({ csrfToken: 'csrf' });
      if (path === '/auth/refresh') return Promise.resolve(session);
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<OAuthResultPage />);
    await screen.findByText(/đăng nhập thành công/i);
    expect(iamRequest).toHaveBeenCalledWith('/auth/csrf', {
      cookieAuth: true,
      auth: { contextId: CONTEXT_ID, sessionTag: TAG },
    });
    expect(iamRequest).toHaveBeenCalledWith(
      '/auth/refresh',
      expect.objectContaining({
        auth: { contextId: CONTEXT_ID, sessionTag: TAG },
        expectProtocol: true,
      }),
    );
    expect(sessionStore.get()).toEqual(session);
    expect((await readSelector(store)).pendingIntent).toBeNull();
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
    expect(iamRequest).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('stolen');
    expect(window.location.search).toBe('');
  });
});
