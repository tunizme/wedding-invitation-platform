import { AdminInvitationEditor } from '../../../../../../features/invitations/service-pages';
export const metadata = {
  title: 'Quản lý thiệp',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminInvitationEditor id={id} />;
}
