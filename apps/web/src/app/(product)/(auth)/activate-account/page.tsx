import { ResetPasswordForm } from '../../../../features/identity-access/forms/recovery-forms';
export const metadata = {
  title: 'Kích hoạt tài khoản',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main style={{ maxWidth: 480, margin: '48px auto', padding: 24 }}>
      <h1>Kích hoạt tài khoản</h1>
      <p>Đặt mật khẩu để quản lý thiệp và khách mời của bạn.</p>
      <ResetPasswordForm activation />
    </main>
  );
}
