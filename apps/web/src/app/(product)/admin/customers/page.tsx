import {
  PlatformPage,
  platformPageStyles,
} from '../../../../ui/platform/platform-page';
import type { Metadata } from 'next';
import { AdminCustomerList } from '../../../../features/identity-access/admin/customer-management';

export const metadata: Metadata = {
  title: 'Quản lý Customer',
  robots: { index: false, follow: false },
};

export default function AdminCustomersPage() {
  return (
    <PlatformPage width="editorial">
      <p className={platformPageStyles.lead}>QUẢN TRỊ TIỆM</p>
      <h1 className={platformPageStyles.heading}>Quản lý Customer</h1>
      <p className={platformPageStyles.lead}>
        Tra cứu tài khoản và quản lý trạng thái truy cập.
      </p>
      <AdminCustomerList />
    </PlatformPage>
  );
}
