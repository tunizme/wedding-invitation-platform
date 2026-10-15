import type { EffectImage, OpeningKind } from '../document/effects';
export const effectAsset = (path: string) => `/effects/opening-effects/${path}`;
export const OPENING_CATALOG: readonly {
  kind: OpeningKind;
  label: string;
  title: string;
  image?: string;
  video?: string;
}[] = [
  {
    kind: 'envelope',
    label: 'Phong bì',
    title: 'Cấu hình phong bì mở đầu',
    image: 'opening-envelope/classic/classic-preview.webp',
  },
  {
    kind: 'invitation',
    label: 'Thiệp mở đầu',
    title: 'Cấu hình nội dung thiệp mở đầu',
    video: 'preview/invitation-card.webm',
  },
  {
    kind: 'intro',
    label: 'Intro Page',
    title: 'Cấu hình Intro Page',
    video: 'preview/intro-page-1.webm',
  },
  {
    kind: 'curtain',
    label: 'Curtain',
    title: 'Chọn kiểu Curtain',
    video: 'preview/curtain-reveal-blue.webm',
  },
  { kind: 'sliding-door', label: 'Cửa trượt', title: 'Cấu hình Cửa trượt' },
  {
    kind: 'animated-image',
    label: 'Animated Image',
    title: 'Cấu hình hiệu ứng Animated Image',
    video: 'preview/animated-image-1.webm',
  },
  {
    kind: 'photobooth',
    label: 'Photobooth',
    title: 'Cấu hình Photobooth',
    image: 'photobooth/preview.webp',
  },
];
const characters = [
  '24bebbc90bc64fe3952b44881c3be849',
  '694f2494535443aa96ab2f8cbf4d06bf',
  '804e975d4ce943ceb59eaef61f6f1e8d',
  'c75adf6d5f824943954f73aa10deb85b',
];
export const PRESET_IMAGES: Record<string, string> = {
  ...Object.fromEntries(
    characters.map((id, i) => [
      `character-${i + 1}`,
      `/effects/resources/characters/${id}.gif`,
    ]),
  ),
  'door-red-left': effectAsset('sliding-door/envelop-left.webp'),
  'door-red-right': effectAsset('sliding-door/envelop-right.webp'),
  'door-white-left': effectAsset('sliding-door/white-floral-left.webp'),
  'door-white-right': effectAsset('sliding-door/white-floral-right.webp'),
  'door-green-left': effectAsset('sliding-door/green-line-floral-left.webp'),
  'door-green-right': effectAsset('sliding-door/green-line-floral-right.webp'),
  'door-pink-left': effectAsset('sliding-door/pink-lily-left.webp'),
  'door-pink-right': effectAsset('sliding-door/pink-lily-right.webp'),
  'seal-01': effectAsset('seals/seal-01.png'),
};
export const DOOR_TEXTURE_IMAGES: Record<string, string> = {
  linen: effectAsset('textures/low-contrast-linen.png'),
  'dark-linen': effectAsset('textures/dark-nilen-texture.png'),
  paper: effectAsset('textures/white-paper-texture-background.webp'),
  floral: effectAsset('textures/bg.webp'),
};
export function effectImageUrl(
  image: EffectImage,
  urls: Record<string, string>,
) {
  return image.assetId
    ? urls[image.assetId]
    : image.preset
      ? PRESET_IMAGES[image.preset]
      : undefined;
}
