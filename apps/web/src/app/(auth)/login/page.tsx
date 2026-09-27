import type { Metadata } from 'next';
import { LoginForm } from '../../../features/identity-access/forms/login-form';
import { SocialLoginButtons } from '../../../features/identity-access/forms/social-login-buttons';

export const metadata: Metadata = {
  title: 'Đăng nhập',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Đăng nhập</h1>
      <p>Dùng email đã xác minh để tiếp tục.</p>
      <LoginForm />
      <SocialLoginButtons />
    </main>
  );
}
