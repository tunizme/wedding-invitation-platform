'use client';

import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { sessionStore } from '../session/store';
import { useOperationLifetime } from '../session/operation-scope';
import { ApiError, type AccessSession } from '../api/client';
import { AuthFlowError, authFlowMessage } from '../session/auth-context-flow';
import { SelectorStorageUnavailable } from '../session/auth-selector';
import { loginLocal } from '../session/refresh-coordinator';
import { Button } from '../../../ui/platform/button';
import { Field } from '../../../ui/platform/field';
import { InlineAlert } from '../../../ui/platform/feedback';

const noSubscription = () => () => {};

export function LoginForm() {
  // Native submit must wait for React's handlers; inputs retain autofill.
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const lifetime = useOperationLifetime('LoginForm');
  const current = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
    if (!ready || submitting.current) return;
    const scope = lifetime.capture();
    submitting.current = true;
    setPending(true);
    setError('');
    setNeedsVerification(false);
    try {
      // 006: provision (if needed) → reserve LOCAL_LOGIN → execute → admit.
      const session = await loginLocal(email, password);
      if (
        !mounted.current ||
        sessionStore.get()?.sessionTag !== session.sessionTag ||
        sessionStore.get()?.user.id !== session.user.id
      )
        return;
      setPassword('');
      setAuthenticated(session);
    } catch (cause) {
      if (!scope.isActive()) return;
      if (cause instanceof ApiError && cause.status === 403) {
        setNeedsVerification(true);
        setError('Bạn cần xác minh email trước khi đăng nhập.');
      } else if (cause instanceof ApiError && cause.status === 401) {
        setError('Email hoặc mật khẩu không đúng.');
      } else if (
        (cause instanceof ApiError && cause.knowledge === 'UNCERTAIN') ||
        (cause instanceof AuthFlowError && cause.reason === 'UNCERTAIN')
      ) {
        setError(
          'Chưa xác nhận được kết quả đăng nhập. Vui lòng kiểm tra lại trước khi thử tiếp.',
        );
      } else if (cause instanceof AuthFlowError) {
        setError(
          authFlowMessage(cause) ??
            (cause.reason === 'RECOVERY_REQUIRED'
              ? 'Không thể xác nhận phiên đăng nhập trong trình duyệt này.'
              : 'Yêu cầu đăng nhập đã được thay thế bởi thao tác mới hơn.'),
        );
      } else if (cause instanceof SelectorStorageUnavailable) {
        setError('Không thể xác nhận phiên đăng nhập trong trình duyệt này.');
      } else {
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Không thể đăng nhập lúc này. Vui lòng thử lại.',
        );
      }
    } finally {
      if (!mounted.current) return;
      submitting.current = false;
      setPending(false);
    }
  }

  if (
    authenticated &&
    current?.user.id === authenticated.user.id &&
    current.sessionTag === authenticated.sessionTag
  )
    return (
      <div role="status">
        <h2>Đăng nhập thành công</h2>
        <p>{authenticated.user.email}</p>
        <Link href="/account">Quản lý tài khoản</Link>
      </div>
    );

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
      <Field
        id="login-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
      />
      <Field
        id="login-password"
        label="Mật khẩu"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
      />
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {needsVerification && (
        <Link href="/verify-email">Gửi lại email xác minh</Link>
      )}
      <Button type="submit" busy={pending} disabled={!ready}>
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </Button>
      <Link href="/forgot-password">Quên mật khẩu?</Link>
      <Link href="/register">Đăng ký tài khoản</Link>
    </form>
  );
}
