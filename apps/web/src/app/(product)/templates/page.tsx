import { CustomerTemplatePicker } from '../../../features/invitations/customer-pages';
import {
  PlatformPage,
  platformPageStyles,
} from '../../../ui/platform/platform-page';
export const metadata = {
  title: 'Chọn mẫu thiệp',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <PlatformPage width="wide">
      <p className={platformPageStyles.lead}>MỘT LỜI MỜI RIÊNG</p>
      <h1 className={platformPageStyles.editorialHeading}>Chọn mẫu thiệp</h1>
      <CustomerTemplatePicker />
    </PlatformPage>
  );
}
