import { AuthPage } from '../../../../ui/product/auth-page';
import { platformPageStyles } from '../../../../ui/platform/platform-page';
import type { Metadata } from 'next';
import { EmailRequestForm } from '../../../../features/identity-access/forms/recovery-forms';

export const metadata: Metadata = {
  title: 'Quên mật khẩu',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <AuthPage kind="forgot-password">
      <h1 className={platformPageStyles.heading}>Quên mật khẩu</h1>
      <p>Nhập email đã đăng ký để nhận hướng dẫn khôi phục.</p>
      <EmailRequestForm reset />
    </AuthPage>
  );
}
