import { TemplateDemo } from '../../../../../features/invitations/template-demo';
export const metadata = {
  title: 'Demo mẫu thiệp · Tiệm làm thiệp',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revision?: string | string[] }>;
}) {
  const { id } = await params;
  const { revision } = await searchParams;
  return (
    <TemplateDemo
      id={id}
      revisionId={typeof revision === 'string' ? revision : undefined}
    />
  );
}
