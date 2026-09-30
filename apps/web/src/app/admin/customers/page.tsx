import type { Metadata } from 'next';
import { AdminCustomerList } from '../../../features/identity-access/admin/customer-management';

export const metadata: Metadata = {
  title: 'Quản lý Customer',
  robots: { index: false, follow: false },
};

export default function AdminCustomersPage() {
  return (
    <main style={{ maxWidth: '60rem', margin: '4rem auto', padding: '1.5rem' }}>
      <h1>Quản lý Customer</h1>
      <AdminCustomerList />
    </main>
  );
}
