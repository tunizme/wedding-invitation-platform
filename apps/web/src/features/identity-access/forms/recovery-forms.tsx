'use client';

import Link from 'next/link';
import { Button } from '../../../ui/platform/button';
import { Field } from '../../../ui/platform/field';
import { InlineAlert } from '../../../ui/platform/feedback';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';

const noSubscription = () => () => {};
import { ApiError, iamRequest } from '../api/client';

const invalid =
  'Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu email mới.';
function safeError(cause: unknown) {
  return cause instanceof ApiError
    ? cause.message
    : 'Không thể kết nối máy chủ. Vui lòng thử lại.';
}
function useFragmentProof() {
  const proofRef = useRef('');
  const initialized = useRef(false);
  const [state, setState] = useState<'loading' | 'valid' | 'invalid'>(
    'loading',
  );
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const tokens = fragment.getAll('token');
      // Replace, never push: Back must not restore the secret-bearing URL.
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
      if (tokens.length === 1 && /^[A-Za-z0-9_-]{40,512}$/.test(tokens[0]))
        proofRef.current = tokens[0];
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setState(proofRef.current ? 'valid' : 'invalid');
    });
    return () => {
      active = false;
    };
  }, []);
  return { proofRef, ready: state !== 'loading', hasProof: state === 'valid' };
}
export function EmailRequestForm({
  reset = false,
  initialError = '',
}: {
  reset?: boolean;
  initialError?: string;
}) {
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [email, setEmail] = useState('');
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await iamRequest(
        reset ? '/auth/password-resets' : '/auth/email-verifications',
        { method: 'POST', body: { email } },
      );
      setDone(true);
    } catch (cause) {
      setError(safeError(cause));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  if (done)
    return (
      <div role="status">
        <h2>Kiểm tra email của bạn</h2>
        <p>
          Nếu yêu cầu hợp lệ, bạn sẽ nhận được email hướng dẫn. Hãy kiểm tra cả
          thư mục thư rác.
        </p>
        <Link href="/login">Đăng nhập</Link>
      </div>
    );
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <Field
        id="recovery-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
      />
      <Button type="submit" busy={pending} disabled={!ready}>
        {pending
          ? 'Đang gửi…'
          : reset
            ? 'Gửi email khôi phục'
            : 'Gửi lại email xác minh'}
      </Button>
    </form>
  );
}
export function VerifyEmailForm() {
  const { proofRef, ready, hasProof } = useFragmentProof();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function confirm() {
    if (submitting.current || !proofRef.current) return;
    submitting.current = true;
    setPending(true);
    try {
      await iamRequest('/auth/email-verifications/confirm', {
        method: 'POST',
        body: { proof: proofRef.current },
      });
      proofRef.current = '';
      setDone(true);
    } catch (cause) {
      setError(safeError(cause));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  if (!ready) return <p role="status">Đang kiểm tra liên kết…</p>;
  if (done)
    return (
      <div role="status">
        <p>Email đã được xác minh. Bạn có thể đăng nhập.</p>
        <Link href="/login">Đăng nhập</Link>
      </div>
    );
  if (!hasProof || error)
    return <EmailRequestForm initialError={error || invalid} />;
  return (
    <Button type="button" busy={pending} onClick={confirm}>
      {pending ? 'Đang xác nhận…' : 'Xác nhận email'}
    </Button>
  );
}
export function ResetPasswordForm({
  activation = false,
}: { activation?: boolean } = {}) {
  const { proofRef, ready, hasProof } = useFragmentProof();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !proofRef.current) return;
    if ([...password].length < 8 || [...password].length > 128) {
      setPasswordError('Mật khẩu cần từ 8 đến 128 ký tự.');
      return;
    }
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await iamRequest(
        activation
          ? '/auth/customer-activation/confirm'
          : '/auth/password-resets/confirm',
        {
          method: 'POST',
          body: { proof: proofRef.current, newPassword: password },
        },
      );
      proofRef.current = '';
      setPassword('');
      setDone(true);
    } catch (cause) {
      setError(safeError(cause));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  if (!ready) return <p role="status">Đang kiểm tra liên kết…</p>;
  if (done)
    return (
      <div role="status">
        <p>
          {activation
            ? 'Tài khoản đã được kích hoạt. Vui lòng đăng nhập để quản lý thiệp.'
            : 'Mật khẩu đã được đổi. Các phiên cũ đã kết thúc. Vui lòng đăng nhập lại.'}
        </p>
        <Link href="/login">Đăng nhập</Link>
      </div>
    );
  if (!hasProof)
    return (
      <>
        <InlineAlert tone="error">{invalid}</InlineAlert>
        {activation && <EmailRequestForm />}
        <Link href={activation ? '/verify-email' : '/forgot-password'}>
          Yêu cầu liên kết mới
        </Link>
      </>
    );
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
      <Field
        id="reset-password"
        error={passwordError}
        label="Mật khẩu mới"
        helper="Từ 8 đến 128 ký tự. Khoảng trắng và chữ hoa được giữ nguyên."
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setPasswordError('');
        }}
        disabled={pending}
      />
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <Button type="submit" busy={pending}>
        {pending
          ? 'Đang xử lý…'
          : activation
            ? 'Kích hoạt tài khoản'
            : 'Đặt lại mật khẩu'}
      </Button>
      <Link href={activation ? '/verify-email' : '/forgot-password'}>
        Yêu cầu liên kết mới
      </Link>
    </form>
  );
}
