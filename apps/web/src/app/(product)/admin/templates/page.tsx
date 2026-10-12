import { PlatformPage } from '../../../../ui/platform/platform-page';
import { TemplateList } from '../../../../features/invitation-builder/editor/template-pages';
import styles from '../../../../features/invitation-builder/editor/template-pages.module.css';
export const metadata = {
  title: 'Mẫu thiệp',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <PlatformPage width="wide">
      <p className={styles.eyebrow}>QUẢN TRỊ TIỆM</p>
      <h1 className={styles.heading}>Mẫu thiệp</h1>
      <p className={styles.lead}>
        Thiết kế được chuẩn bị tại đây; khách hàng cá nhân hóa nội dung theo
        mẫu.
      </p>
      <TemplateList />
    </PlatformPage>
  );
}
