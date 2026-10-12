import { AuthPage } from '../../../../ui/product/auth-page';
import { platformPageStyles } from '../../../../ui/platform/platform-page';
import { RegisterForm } from '../../../../features/identity-access/forms/register-form';

export const metadata = { title: 'Đăng ký tài khoản' };
export default function RegisterPage() {
  return (
    <AuthPage kind="register">
      <h1 className={platformPageStyles.heading}>Tạo tài khoản</h1>
      <p>Đăng ký bằng email và xác minh địa chỉ để bắt đầu.</p>
      <RegisterForm />
    </AuthPage>
  );
}
