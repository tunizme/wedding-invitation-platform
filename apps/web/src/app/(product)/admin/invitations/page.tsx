import { AdminInvitations } from '../../../../features/invitations/service-pages';
export const metadata = {
  title: 'Thiệp khách hàng',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminInvitations />;
}
