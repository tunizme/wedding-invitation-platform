import { RsvpManagement } from '../../../../../../features/invitations/rsvp-management';
export const metadata = {
  title: 'Quản lý RSVP',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main>
      <RsvpManagement id={id} assisted />
    </main>
  );
}
