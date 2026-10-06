import { CustomerInvitationList } from '../../features/invitations/customer-pages';
export const metadata = { title: 'Thiệp của tôi', robots: { index: false, follow: false } };
export default function Page() { return <main><h1>Thiệp của tôi</h1><CustomerInvitationList /></main>; }
