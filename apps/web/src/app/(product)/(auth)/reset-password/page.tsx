import { AuthPage } from '../../../../ui/product/auth-page';
import { platformPageStyles } from '../../../../ui/platform/platform-page';
import type { Metadata } from 'next';
import { ResetPasswordForm } from '../../../../features/identity-access/forms/recovery-forms';

export const metadata: Metadata = {
  title: 'Đặt lại mật khẩu',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <AuthPage kind="reset-password">
      <h1 className={platformPageStyles.heading}>Đặt lại mật khẩu</h1>
      <p>Chọn mật khẩu mới cho tài khoản của bạn.</p>
      <ResetPasswordForm />
    </AuthPage>
  );
}
