import { AuthPage } from '../../../../ui/product/auth-page';
import { platformPageStyles } from '../../../../ui/platform/platform-page';
import type { Metadata } from 'next';
import { VerifyEmailForm } from '../../../../features/identity-access/forms/recovery-forms';

export const metadata: Metadata = {
  title: 'Xác minh email',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <AuthPage kind="verify-email">
      <h1 className={platformPageStyles.heading}>Xác minh email</h1>
      <p>Xác nhận địa chỉ email trước khi đăng nhập.</p>
      <VerifyEmailForm />
    </AuthPage>
  );
}
