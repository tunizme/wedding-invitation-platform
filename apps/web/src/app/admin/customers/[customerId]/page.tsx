import type { Metadata } from 'next';
import { AdminCustomerDetail } from '../../../../features/identity-access/admin/customer-management';

export const metadata: Metadata = {
  title: 'Chi tiết Customer',
  robots: { index: false, follow: false },
};

export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return (
    <main style={{ maxWidth: '42rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Customer</h1>
      <AdminCustomerDetail customerId={customerId} />
    </main>
  );
}
