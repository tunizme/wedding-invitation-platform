import { cache } from 'react';
import type { Metadata } from 'next';
import { UnavailableInvitation } from '../../../ui/product/unavailable-invitation';
import { serverEnvironment } from '../../../config/server-env';
import '@/features/invitation-builder/renderer/fonts.css';
import { PublicInvitationView } from '../../../features/invitations/public-invitation-view';
import type {
  RenderContext,
  SupportedResolvedScene,
} from '../../../features/invitation-builder/document/types';

type PublicResponse = {
  publicVersion: number;
  scene: SupportedResolvedScene;
  context: RenderContext;
};
const readPublic = cache(
  async (slug: string): Promise<PublicResponse | null> => {
    if (!/^[0-9a-f-]{36}$/i.test(slug)) return null;
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
    return value;
  },
);
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params,
    value = await readPublic(slug),
    settings =
      value?.scene.schemaVersion === 3 ? value.scene.settings : undefined;
  const title = settings?.title || 'Thiệp cưới',
    description = settings?.description || undefined,
    asset = settings?.shareImageId
      ? value?.context.assetUrls[settings.shareImageId]
      : undefined,
    base = process.env.NEXT_PUBLIC_API_BASE_URL;
  const image =
    asset && base ? new URL(asset, new URL(base).origin).href : undefined;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      locale: settings?.locale === 'en' ? 'en_US' : 'vi_VN',
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const value = await readPublic(slug);
  if (
    !value ||
    value.scene.schemaVersion !== 3 ||
    value.scene.rendererContractVersion !== 3
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
