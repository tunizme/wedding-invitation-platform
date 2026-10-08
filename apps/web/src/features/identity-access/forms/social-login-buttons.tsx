'use client';

import { useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/client';
import {
  authFlowMessage,
  ensureContext,
  reserveIntent,
} from '../session/auth-context-flow';
import { selectorStore } from '../session/auth-selector';

const noSubscription = () => () => {};

function oauthStart(provider: 'google' | 'facebook'): string | undefined {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) return undefined;
  try {
    const parsed = new URL(base);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return `${base.replace(/\/$/, '')}/auth/oauth/${provider}/start`;
  } catch {
    return undefined;
  }
}

export function SocialLoginButtons() {
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const google = oauthStart('google');
  const facebook = oauthStart('facebook');
  if (!google || !facebook) return null;

  async function start(url: string) {
    if (!ready || pending) return;
    setPending(true);
    setError('');
    try {
      const store = await selectorStore();
      await ensureContext(store);
      const reserved = await reserveIntent(store, 'OAUTH');
      // OAuth leaves the app for the external API/provider flow in a full navigation.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `${url}?intent=${encodeURIComponent(reserved.intentId)}`,
      );
    } catch (cause) {
      setError(
        authFlowMessage(cause) ??
          (cause instanceof ApiError
            ? cause.message
            : 'Không thể bắt đầu đăng nhập mạng xã hội. Vui lòng thử lại.'),
      );
      setPending(false);
    }
  }

  return (
    <div aria-label="Đăng nhập mạng xã hội" style={{ marginTop: '1rem' }}>
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="button"
        disabled={!ready || pending}
        onClick={() => void start(google)}
      >
        Tiếp tục với Google
      </button>
      {' · '}
      <button
        type="button"
        disabled={!ready || pending}
        onClick={() => void start(facebook)}
      >
        Tiếp tục với Facebook
      </button>
    </div>
  );
}
