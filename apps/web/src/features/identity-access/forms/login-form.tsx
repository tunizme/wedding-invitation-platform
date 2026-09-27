'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, iamRequest, type AccessSession } from '../api/client';
import { sessionStore } from '../session/store';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [authenticated, setAuthenticated] = useState<AccessSession | null>(
    null,
  );
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    setNeedsVerification(false);
    try {
      const session = await iamRequest<AccessSession>('/auth/login', {
        method: 'POST',
        body: { email, password },
        cookieAuth: true,
      });
      sessionStore.set(session);
      setPassword('');
      setAuthenticated(session);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        setNeedsVerification(true);
        setError('Bạn cần xác minh email trước khi đăng nhập.');
      } else if (cause instanceof ApiError && cause.status === 401) {
        setError('Email hoặc mật khẩu không đúng.');
      } else {
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Không thể đăng nhập lúc này. Vui lòng thử lại.',
        );
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (authenticated)
    return (
      <div role="status">
        <h2>Đăng nhập thành công</h2>
        <p>{authenticated.user.email}</p>
      </div>
    );

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
      <label htmlFor="login-email">Email</label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
      />
      <label htmlFor="login-password">Mật khẩu</label>
      <input
        id="login-password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
      />
      {error && <p role="alert">{error}</p>}
      {needsVerification && (
        <Link href="/verify-email">Gửi lại email xác minh</Link>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
      <Link href="/forgot-password">Quên mật khẩu?</Link>
      <Link href="/register">Đăng ký tài khoản</Link>
    </form>
  );
}
