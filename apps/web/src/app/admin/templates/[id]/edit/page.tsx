import { EditTemplate } from '../../../../../features/invitation-builder/editor/template-pages';
export const metadata = {
  title: 'Thiết kế thiệp',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main>
      <EditTemplate id={id} />
    </main>
  );
}
