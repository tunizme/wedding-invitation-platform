import {
  PlatformPage,
  platformPageStyles,
} from '../../../../../../ui/platform/platform-page';
import { InvitationInteractions } from '../../../../../../features/invitations/interaction-pages';
export const metadata = {
  title: 'Duyệt lời chúc',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlatformPage width="editorial">
      <h1 className={platformPageStyles.heading}>Duyệt lời chúc</h1>
      <InvitationInteractions key={id} id={id} assisted />
    </PlatformPage>
  );
}
