import { CustomerInvitationList } from '../../../features/invitations/customer-pages';
import { AccountWorkspace } from '../../../ui/product/account-workspace';
import {
  PlatformPage,
  platformPageStyles,
} from '../../../ui/platform/platform-page';
export const metadata = {
  title: 'Thiệp của tôi',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <AccountWorkspace>
      <PlatformPage width="editorial">
        <h1 className={platformPageStyles.heading}>Thiệp của tôi</h1>
        <CustomerInvitationList />
      </PlatformPage>
    </AccountWorkspace>
  );
}
