import type { Metadata } from 'next';
import { VerifyEmailForm } from '../../../features/identity-access/forms/recovery-forms';

export const metadata: Metadata = {
  title: 'Xác minh email',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Xác minh email</h1>
      <p>Xác nhận địa chỉ email trước khi đăng nhập.</p>
      <VerifyEmailForm />
    </main>
  );
}
