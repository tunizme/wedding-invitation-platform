'use client';

import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ApiError, iamRequest } from '../api/client';
import { Button } from '../../../ui/platform/button';
import { Field } from '../../../ui/platform/field';
import { InlineAlert } from '../../../ui/platform/feedback';

const noSubscription = () => () => {};

export function RegisterForm() {
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [pending, setPending] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState('');
  const submitting = useRef(false);
  const [passwordError, setPasswordError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submitting.current) return;
    if ([...password].length < 8 || [...password].length > 128) {
      setPasswordError('Mật khẩu cần từ 8 đến 128 ký tự.');
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
      <Field
        id="register-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
      />
      <Field
        id="register-password"
        label="Mật khẩu"
        error={passwordError}
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
      <Button type="submit" busy={pending} disabled={!ready}>
        {pending ? 'Đang đăng ký…' : 'Đăng ký'}
      </Button>
    </form>
  );
}
