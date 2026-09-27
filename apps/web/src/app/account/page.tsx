import type { Metadata } from 'next';
import { ProfileForm } from '../../features/identity-access/forms/profile-form';

export const metadata: Metadata = {
  title: 'Tài khoản',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main style={{ maxWidth: '36rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Tài khoản của bạn</h1>
      <ProfileForm />
    </main>
  );
}
