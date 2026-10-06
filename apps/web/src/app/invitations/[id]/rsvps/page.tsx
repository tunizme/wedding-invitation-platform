import { RsvpManagement } from '../../../../features/invitations/rsvp-management';
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
    <main>
      <h1>Phản hồi RSVP</h1>
      <RsvpManagement key={id} id={id} />
    </main>
  );
}
