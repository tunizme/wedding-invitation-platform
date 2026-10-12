import Link from 'next/link';
import { AccountWorkspace } from '../../../ui/product/account-workspace';
import { CustomerInvitationList } from '../../../features/invitations/customer-pages';
import {
  PlatformPage,
  platformPageStyles,
} from '../../../ui/platform/platform-page';

export const metadata = {
  title: 'Tổng quan · Tiệm làm thiệp',
  robots: { index: false, follow: false },
};

export default function OverviewPage() {
  return (
    <AccountWorkspace>
      <PlatformPage width="editorial">
        <h1 className={platformPageStyles.heading}>Tổng quan</h1>
        <p>Tiếp tục chăm chút lời mời của bạn, hoặc bắt đầu từ một mẫu mới.</p>
        <p>
          <Link href="/templates">Khám phá mẫu thiệp</Link> ·{' '}
          <Link href="/account">Thông tin cá nhân</Link>
        </p>
        <CustomerInvitationList overview />
      </PlatformPage>
    </AccountWorkspace>
  );
}
