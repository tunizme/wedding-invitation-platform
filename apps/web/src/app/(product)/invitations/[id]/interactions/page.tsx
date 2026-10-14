import Link from 'next/link';
import {
  PlatformPage,
  platformPageStyles,
} from '../../../../../ui/platform/platform-page';
import { InvitationInteractions } from '../../../../../features/invitations/interaction-pages';
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
      <h1 className={platformPageStyles.heading}>Lời chúc & phản hồi</h1>
      <InvitationInteractions key={id} id={id} />
    </PlatformPage>
  );
}
