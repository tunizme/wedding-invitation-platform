import { UnavailableInvitation } from '../../../ui/product/unavailable-invitation';
import { serverEnvironment } from '../../../config/server-env';
import '@/features/invitation-builder/renderer/fonts.css';
import { PublicInvitationView } from '../../../features/invitations/public-invitation-view';
import type {
  RenderContext,
  SupportedResolvedScene,
} from '../../../features/invitation-builder/document/types';

export const metadata = {
  title: 'Thiệp cưới',
  robots: { index: false, follow: false },
};
type PublicResponse = {
  publicVersion: number;
  scene: SupportedResolvedScene;
  context: RenderContext;
};
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(slug)) return <UnavailableInvitation />;
  const base = serverEnvironment().apiInternalBaseUrl;
  let value: PublicResponse | null = null;
  try {
    const response = await fetch(`${base}/public/invitations/${slug}`, {
      cache: 'no-store',
      redirect: 'error',
    });
    if (response.ok) value = (await response.json()) as PublicResponse;
  } catch {
    /* The same unavailable state is shown for network and missing invitations. */
  }
  if (
    !value ||
    !(
      (value.scene.schemaVersion === 1 &&
        value.scene.rendererContractVersion === 1) ||
      (value.scene.schemaVersion === 2 &&
        value.scene.rendererContractVersion === 2)
    )
  )
    return <UnavailableInvitation />;
  const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!publicBase) return <UnavailableInvitation />;
  const origin = new URL(publicBase).origin;
  const assetUrls = Object.fromEntries(
    Object.entries(value.context.assetUrls).map(([id, path]) => [
      id,
      new URL(path, origin).href,
    ]),
  );
  return (
    <main>
      <PublicInvitationView
        scene={value.scene}
        context={{ ...value.context, assetUrls }}
      />
    </main>
  );
}
