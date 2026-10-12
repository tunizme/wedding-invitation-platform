import { PlatformPage } from '../../../../../ui/platform/platform-page';
import { NewTemplate } from '../../../../../features/invitation-builder/editor/template-pages';
import styles from '../../../../../features/invitation-builder/editor/template-pages.module.css';
export const metadata = {
  title: 'Tạo mẫu thiệp',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <PlatformPage width="reading">
      <p className={styles.eyebrow}>QUẢN TRỊ TIỆM</p>
      <h1 className={styles.heading}>Tạo mẫu thiệp</h1>
      <p className={styles.lead}>
        Thiết kế được chuẩn bị tại đây; khách hàng cá nhân hóa nội dung theo
        mẫu.
      </p>
      <NewTemplate />
    </PlatformPage>
  );
}
