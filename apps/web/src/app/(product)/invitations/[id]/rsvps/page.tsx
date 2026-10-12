import Link from 'next/link';
import {
  PlatformPage,
  platformPageStyles,
} from '../../../../../ui/platform/platform-page';
import { RsvpManagement } from '../../../../../features/invitations/rsvp-management';
export const metadata = {
  title: 'Phản hồi RSVP',
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
      <Link href={`/invitations/${id}/edit`}>← Về thiệp của bạn</Link>
      <h1 className={platformPageStyles.heading}>Phản hồi RSVP</h1>
      <p className={platformPageStyles.lead}>
        Những lời hẹn, những người sẽ ở bên bạn trong ngày đáng nhớ.
      </p>
      <RsvpManagement key={id} id={id} />
    </PlatformPage>
  );
}
