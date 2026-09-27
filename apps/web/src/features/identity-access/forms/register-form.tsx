'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ApiError, iamRequest } from '../api/client';

export function RegisterForm() {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [pending, setPending] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if ([...password].length < 8 || [...password].length > 128) {
      setError('Mật khẩu cần từ 8 đến 128 ký tự.');
      return;
    }
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await iamRequest<{ message: string }>('/auth/registrations', {
        method: 'POST',
        body: { email, password },
      });
      setPassword('');
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Không thể đăng ký lúc này. Vui lòng thử lại.',
      );
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
          Nếu yêu cầu hợp lệ, bạn sẽ nhận được email hướng dẫn xác minh. Hãy
          kiểm tra cả thư mục thư rác.
        </p>
        <p>Bạn cần xác minh email trước khi đăng nhập.</p>
      </div>
    );
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
      <label htmlFor="register-email">Email</label>
      <input
        id="register-email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
      />
      <label htmlFor="register-password">Mật khẩu</label>
      <input
        id="register-password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-describedby="password-help"
        disabled={pending}
      />
      <small id="password-help">
        Từ 8 đến 128 ký tự. Khoảng trắng và chữ hoa được giữ nguyên.
      </small>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang đăng ký…' : 'Đăng ký'}
      </button>
    </form>
  );
}
