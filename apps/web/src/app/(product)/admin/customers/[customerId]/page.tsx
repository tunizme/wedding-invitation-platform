import {
  PlatformPage,
  platformPageStyles,
} from '../../../../../ui/platform/platform-page';
import type { Metadata } from 'next';
import { AdminCustomerDetail } from '../../../../../features/identity-access/admin/customer-management';

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
    <PlatformPage width="reading">
      <h1 className={platformPageStyles.heading}>Customer</h1>
      <AdminCustomerDetail customerId={customerId} />
    </PlatformPage>
  );
}
