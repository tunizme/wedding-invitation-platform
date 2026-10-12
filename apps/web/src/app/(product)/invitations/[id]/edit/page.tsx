import {
  PlatformPage,
  platformPageStyles,
} from '../../../../../ui/platform/platform-page';
import { CustomerInvitationForm } from '../../../../../features/invitations/customer-invitation-form';
export const metadata = {
  title: 'Chỉnh thông tin thiệp',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlatformPage width="wide">
      <h1 className={platformPageStyles.heading}>Chỉnh thông tin thiệp</h1>
      <CustomerInvitationForm id={id} />
    </PlatformPage>
  );
}
