import Link from 'next/link';
import {
  PlatformPage,
  platformPageStyles,
} from '../../../../../ui/platform/platform-page';
import { InvitationInteractions } from '../../../../../features/invitations/interaction-pages';
import { invitationFeatureVisibility } from '../../../../../features/invitations/feature-visibility';
export const metadata = {
  title: 'Tương tác thiệp',
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
      <Link href={`/invitations/${id}/edit`}>← Về thiệp</Link>
      <h1 className={platformPageStyles.heading}>
        {invitationFeatureVisibility.wishes
          ? 'Lời chúc & phản hồi'
          : 'Phản hồi biểu mẫu'}
      </h1>
      <InvitationInteractions key={id} id={id} />
    </PlatformPage>
  );
}
