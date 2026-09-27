'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  const [email, setEmail] = useState('');
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
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
      {error && <p role="alert">{error}</p>}
      <label htmlFor="recovery-email">Email</label>
      <input
        id="recovery-email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
      />
      <button type="submit" disabled={pending}>
        {pending
          ? 'Đang gửi…'
          : reset
            ? 'Gửi email khôi phục'
            : 'Gửi lại email xác minh'}
      </button>
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
    <button type="button" disabled={pending} onClick={confirm}>
      {pending ? 'Đang xác nhận…' : 'Xác nhận email'}
    </button>
  );
}
export function ResetPasswordForm() {
  const { proofRef, ready, hasProof } = useFragmentProof();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !proofRef.current) return;
    if ([...password].length < 8 || [...password].length > 128) {
      setError('Mật khẩu cần từ 8 đến 128 ký tự.');
      return;
    }
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await iamRequest('/auth/password-resets/confirm', {
        method: 'POST',
        body: { proof: proofRef.current, newPassword: password },
      });
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
          Mật khẩu đã được đổi. Các phiên cũ đã kết thúc. Vui lòng đăng nhập
          lại.
        </p>
        <Link href="/login">Đăng nhập</Link>
      </div>
    );
  if (!hasProof)
    return (
      <>
        <p role="alert">{invalid}</p>
        <Link href="/forgot-password">Yêu cầu liên kết mới</Link>
      </>
    );
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
      <label htmlFor="reset-password">Mật khẩu mới</label>
      <input
        id="reset-password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={pending}
        aria-describedby="reset-password-help"
      />
      <small id="reset-password-help">
        Từ 8 đến 128 ký tự. Khoảng trắng và chữ hoa được giữ nguyên.
      </small>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang đổi mật khẩu…' : 'Đặt lại mật khẩu'}
      </button>
      <Link href="/forgot-password">Yêu cầu liên kết mới</Link>
    </form>
  );
}
