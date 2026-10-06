import { TemplateList } from '../../../features/invitation-builder/editor/template-pages';
export const metadata = {
  title: 'Mẫu thiệp',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main>
      <h1>Mẫu thiệp</h1>
      <TemplateList />
    </main>
  );
}
