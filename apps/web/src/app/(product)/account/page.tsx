import {
  PlatformPage,
  platformPageStyles,
} from '../../../ui/platform/platform-page';
import { AccountWorkspace } from '../../../ui/product/account-workspace';
import type { Metadata } from 'next';
import { ProfileForm } from '../../../features/identity-access/forms/profile-form';

export const metadata: Metadata = {
  title: 'Tài khoản',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <AccountWorkspace>
      <PlatformPage width="reading">
        <h1 className={platformPageStyles.heading}>Tài khoản của bạn</h1>
        <ProfileForm />
      </PlatformPage>
    </AccountWorkspace>
  );
}
