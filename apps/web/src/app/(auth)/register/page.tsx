import { RegisterForm } from '../../../features/identity-access/forms/register-form';

export const metadata = { title: 'Đăng ký tài khoản' };
export default function RegisterPage() {
  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Tạo tài khoản</h1>
      <p>Đăng ký bằng email và xác minh địa chỉ để bắt đầu.</p>
      <RegisterForm />
    </main>
  );
}
