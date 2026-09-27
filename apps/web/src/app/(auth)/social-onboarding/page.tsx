import type { Metadata } from 'next';
import { SocialOnboardingForm } from '../../../features/identity-access/forms/social-onboarding-form';

export const metadata: Metadata = {
  title: 'Hoàn tất đăng ký mạng xã hội',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function SocialOnboardingPage() {
  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Hoàn tất đăng ký</h1>
      <p>Xác minh email để tạo tài khoản và bắt đầu phiên đăng nhập.</p>
      <SocialOnboardingForm />
    </main>
  );
}
