import { NewTemplate } from '../../../../features/invitation-builder/editor/template-pages';
export const metadata = {
  title: 'Tạo mẫu thiệp',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main>
      <h1>Tạo mẫu thiệp</h1>
      <NewTemplate />
    </main>
  );
}
