import type { Metadata } from 'next';
import { EmailRequestForm } from '../../../features/identity-access/forms/recovery-forms';

export const metadata: Metadata = {
  title: 'Quên mật khẩu',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Quên mật khẩu</h1>
      <p>Nhập email đã đăng ký để nhận hướng dẫn khôi phục.</p>
      <EmailRequestForm reset />
    </main>
  );
}
