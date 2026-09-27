import type { Metadata } from 'next';
import { ResetPasswordForm } from '../../../features/identity-access/forms/recovery-forms';

export const metadata: Metadata = {
  title: 'Đặt lại mật khẩu',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Đặt lại mật khẩu</h1>
      <p>Chọn mật khẩu mới cho tài khoản của bạn.</p>
      <ResetPasswordForm />
    </main>
  );
}
