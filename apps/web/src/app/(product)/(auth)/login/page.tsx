import { AuthPage } from '../../../../ui/product/auth-page';
import { platformPageStyles } from '../../../../ui/platform/platform-page';
import type { Metadata } from 'next';
import { LoginForm } from '../../../../features/identity-access/forms/login-form';
import { SocialLoginButtons } from '../../../../features/identity-access/forms/social-login-buttons';

export const metadata: Metadata = {
  title: 'Đăng nhập',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthPage kind="login">
      <h1 className={platformPageStyles.heading}>Đăng nhập</h1>
      <p>Dùng email đã xác minh để tiếp tục.</p>
      <LoginForm />
      <SocialLoginButtons />
    </AuthPage>
  );
}
