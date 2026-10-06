import { CustomerInvitationForm } from '../../../../features/invitations/customer-invitation-form';
export const metadata = { title: 'Chỉnh thông tin thiệp', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><h1>Chỉnh thông tin thiệp</h1><CustomerInvitationForm id={id} /></main>;
}
