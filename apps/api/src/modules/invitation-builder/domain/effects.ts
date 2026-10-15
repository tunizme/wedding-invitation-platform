import { FONT_IDS } from './font-catalog';

export const OPENING_KINDS = [
  'envelope',
  'invitation',
  'intro',
  'curtain',
  'sliding-door',
  'animated-image',
  'photobooth',
] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];
export const INVITATION_THEMES = [
  ['songlong-red', 'Song Long | Đỏ'],
  ['songlong-lam', 'Song Long | Lam'],
  ['songphung-red', 'Song Phụng | Kem / Đỏ Đô'],
  ['songphung-green', 'Song Phụng | Kem / Xanh Lá'],
  ['red-v1', 'Long Phụng v1 | Đỏ'],
  ['longphung-v1-green', 'Long Phụng v1 | Xanh'],
  ['longphung-v1-lam', 'Long Phụng v1 | Lam'],
  ['longphung-v2-red', 'Long Phụng v2 | Đỏ'],
  ['la-ngoc-green', 'Lá Ngọc | Xanh Lá'],
  ['boho-floral-green', 'Hoa Mộc | Xanh Lá'],
  ['vuonxuan-green', 'Vườn Xuân | Xanh Ngọc'],
  ['royal-red', 'Royal | Đỏ Hoàng Gia'],
] as const;
export interface InvitationColors {
  background: string;
  text: string;
  buttonBackground: string;
  buttonText: string;
  backdropStart: string;
  backdropMiddle: string;
  backdropEnd: string;
}
export const INVITATION_COLORS: Record<
  (typeof INVITATION_THEMES)[number][0],
  InvitationColors
> = {
  'songlong-red': {
    background: '#A31D16FF',
    text: '#F0D497FF',
    buttonBackground: '#F0D497FF',
    buttonText: '#4A1212FF',
    backdropStart: '#4A1212FF',
    backdropMiddle: '#3A0E0EFF',
    backdropEnd: '#2A0808FF',
  },
  'songlong-lam': {
    background: '#1A3060FF',
    text: '#F0D497FF',
    buttonBackground: '#F0D497FF',
    buttonText: '#0F1A2EFF',
    backdropStart: '#0F1A2EFF',
    backdropMiddle: '#152848FF',
    backdropEnd: '#1A3060FF',
  },
  'songphung-red': {
    background: '#FFF0E7FF',
    text: '#710001FF',
    buttonBackground: '#710001FF',
    buttonText: '#FFF0E7FF',
    backdropStart: '#4A1212FF',
    backdropMiddle: '#3A0E0EFF',
    backdropEnd: '#2A0808FF',
  },
  'songphung-green': {
    background: '#FFF0E7FF',
    text: '#19472DFF',
    buttonBackground: '#19472DFF',
    buttonText: '#FFF0E7FF',
    backdropStart: '#E8F5E9FF',
    backdropMiddle: '#C8E6C9FF',
    backdropEnd: '#A5D6A7FF',
  },
  'red-v1': {
    background: '#680E0EFF',
    text: '#E9CE9EFF',
    buttonBackground: '#E9CE9EFF',
    buttonText: '#360202FF',
    backdropStart: '#360202FF',
    backdropMiddle: '#2A0202FF',
    backdropEnd: '#1C0101FF',
  },
  'longphung-v1-green': {
    background: '#162614FF',
    text: '#E9CE9EFF',
    buttonBackground: '#E9CE9EFF',
    buttonText: '#0A0F09FF',
    backdropStart: '#0A0F09FF',
    backdropMiddle: '#101910FF',
    backdropEnd: '#162514FF',
  },
  'longphung-v1-lam': {
    background: '#0A202FFF',
    text: '#E9CE9EFF',
    buttonBackground: '#E9CE9EFF',
    buttonText: '#030A11FF',
    backdropStart: '#030A11FF',
    backdropMiddle: '#061C2AFF',
    backdropEnd: '#0A202FFF',
  },
  'longphung-v2-red': {
    background: '#680D0EFF',
    text: '#E9CE9EFF',
    buttonBackground: '#E9CE9EFF',
    buttonText: '#4A0808FF',
    backdropStart: '#4A0808FF',
    backdropMiddle: '#350A0BFF',
    backdropEnd: '#250708FF',
  },
  'la-ngoc-green': {
    background: '#4E6439FF',
    text: '#4E6439FF',
    buttonBackground: '#FFFFFFFF',
    buttonText: '#2F4520FF',
    backdropStart: '#25371AFF',
    backdropMiddle: '#1A2712FF',
    backdropEnd: '#2F4520FF',
  },
  'boho-floral-green': {
    background: '#30530FFF',
    text: '#30530FFF',
    buttonBackground: '#FFFAF7FF',
    buttonText: '#2B4317FF',
    backdropStart: '#203111FF',
    backdropMiddle: '#18260DFF',
    backdropEnd: '#2B4317FF',
  },
  'vuonxuan-green': {
    background: '#5D6A57FF',
    text: '#5D6A57FF',
    buttonBackground: '#FFFFFFFF',
    buttonText: '#364131FF',
    backdropStart: '#2C3528FF',
    backdropMiddle: '#22291FFF',
    backdropEnd: '#364131FF',
  },
  'royal-red': {
    background: '#3E0001FF',
    text: '#E1BC7CFF',
    buttonBackground: '#E1BC7CFF',
    buttonText: '#3E0001FF',
    backdropStart: '#1A0505FF',
    backdropMiddle: '#2D0002FF',
    backdropEnd: '#3E0001FF',
  },
};
export const CURTAIN_COLORS = [
  'blue',
  'pink',
  'purple',
  'yellow',
  'red',
] as const;
export const DOOR_TEXTURES = [
  'plain',
  'stripes',
  'linen',
  'dark-linen',
  'paper',
  'floral',
] as const;
export const EFFECT_IMAGE_PRESETS = [
  'character-1',
  'character-2',
  'character-3',
  'character-4',
  'door-red-left',
  'door-red-right',
  'door-white-left',
  'door-white-right',
  'door-green-left',
  'door-green-right',
  'door-pink-left',
  'door-pink-right',
  'seal-01',
] as const;
export interface EffectImage {
  assetId: string | null;
  preset: (typeof EFFECT_IMAGE_PRESETS)[number] | null;
}
interface Names {
  groom: string;
  bride: string;
  title: string;
  buttonText: string;
  font: string;
}
export type OpeningEffect =
  | ({ kind: 'envelope'; variant: 'classic' | 'begie' | 'red' } & Names)
  | {
      kind: 'invitation';
      theme: (typeof INVITATION_THEMES)[number][0];
      person1: string;
      person2: string;
      date: string;
      buttonText: string;
      guestLabel: string;
      guestName: string;
      message: string;
      colors: InvitationColors;
    }
  | { kind: 'intro'; variant: 1 | 2; images: [EffectImage, EffectImage] }
  | { kind: 'curtain'; color: (typeof CURTAIN_COLORS)[number] }
  | {
      kind: 'sliding-door';
      trigger: 'auto' | 'tap';
      mode: 'texture' | 'image';
      color: string;
      texture: (typeof DOOR_TEXTURES)[number];
      images: [EffectImage, EffectImage];
      seal: EffectImage;
    }
  | {
      kind: 'animated-image';
      title: string;
      subtitle: string;
      duration: number;
      image: EffectImage;
    }
  | ({
      kind: 'photobooth';
      footer: string;
      background: string;
      color: string;
      images: [EffectImage, EffectImage, EffectImage];
    } & Names);
export const emptyEffectImage = (): EffectImage => ({
  assetId: null,
  preset: null,
});
export function defaultOpeningEffect(kind: OpeningKind): OpeningEffect {
  const names = {
    groom: 'Tuấn Minh',
    bride: 'Thảo Nhi',
    title: "We're getting married!",
    buttonText: 'CHẠM ĐỂ MỞ',
    font: 'aquarelle',
  };
  switch (kind) {
    case 'envelope':
      return { kind, variant: 'classic', ...names };
    case 'invitation':
      return {
        kind,
        theme: 'songlong-red',
        person1: 'Tuấn Minh',
        person2: 'Thảo Nhi',
        date: '1 tháng 2, 2026',
        buttonText: 'Mở thiệp',
        guestLabel: 'Kính mời',
        guestName: 'Bạn & người thương',
        message: 'đến dự buổi tiệc chung vui cùng gia đình',
        colors: { ...INVITATION_COLORS['songlong-red'] },
      };
    case 'intro':
      return {
        kind,
        variant: 1,
        images: [emptyEffectImage(), emptyEffectImage()],
      };
    case 'curtain':
      return { kind, color: 'blue' };
    case 'sliding-door':
      return {
        kind,
        trigger: 'auto',
        mode: 'texture',
        color: '#2A4A3CFF',
        texture: 'linen',
        images: [
          { assetId: null, preset: 'door-red-left' },
          { assetId: null, preset: 'door-red-right' },
        ],
        seal: { assetId: null, preset: 'seal-01' },
      };
    case 'animated-image':
      return {
        kind,
        title: 'Wedding Day',
        subtitle: 'Xin mời xem thiệp cưới của chúng mình nha',
        duration: 5,
        image: { assetId: null, preset: 'character-1' },
      };
    case 'photobooth':
      return {
        kind,
        ...names,
        title: 'WE ARE GETTING MARRIED!',
        buttonText: 'OPEN INVITATION',
        footer: '22.07.2027',
        background: '#4A1218FF',
        color: '#FFFFFFFF',
        images: [emptyEffectImage(), emptyEffectImage(), emptyEffectImage()],
      };
  }
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 120) =>
  typeof v === 'string' && v.length <= max;
const color = (v: unknown) =>
  typeof v === 'string' && /^#[0-9a-f]{8}$/i.test(v);
const member = (v: unknown, values: readonly string[]) =>
  typeof v === 'string' && values.includes(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).length === allowed.length &&
  allowed.every((k) => Object.hasOwn(v, k));
function image(v: unknown): v is EffectImage {
  return (
    record(v) &&
    keys(v, ['assetId', 'preset']) &&
    (v.assetId === null ||
      (typeof v.assetId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          v.assetId,
        ))) &&
    (v.preset === null || member(v.preset, EFFECT_IMAGE_PRESETS)) &&
    !(v.assetId && v.preset)
  );
}
const images = (v: unknown, count: number) =>
  Array.isArray(v) && v.length === count && v.every(image);
export function validOpeningEffect(v: unknown): v is OpeningEffect {
  if (!record(v)) return false;
  const names = ['groom', 'bride', 'title', 'buttonText', 'font'];
  const validNames = () =>
    names.every((k) => text(v[k])) &&
    (v.font === 'aquarelle' || member(v.font, FONT_IDS));
  switch (v.kind) {
    case 'envelope':
      return (
        keys(v, ['kind', 'variant', ...names]) &&
        validNames() &&
        member(v.variant, ['classic', 'begie', 'red'])
      );
    case 'invitation':
      return (
        keys(v, [
          'kind',
          'theme',
          'person1',
          'person2',
          'date',
          'buttonText',
          'guestLabel',
          'guestName',
          'message',
          'colors',
        ]) &&
        member(
          v.theme,
          INVITATION_THEMES.map((x) => x[0]),
        ) &&
        [
          'person1',
          'person2',
          'date',
          'buttonText',
          'guestLabel',
          'guestName',
        ].every((k) => text(v[k])) &&
        text(v.message, 1000) &&
        record(v.colors) &&
        keys(v.colors, [
          'background',
          'text',
          'buttonBackground',
          'buttonText',
          'backdropStart',
          'backdropMiddle',
          'backdropEnd',
        ]) &&
        Object.values(v.colors).every(color)
      );
    case 'intro':
      return (
        keys(v, ['kind', 'variant', 'images']) &&
        [1, 2].includes(v.variant as number) &&
        images(v.images, 2)
      );
    case 'curtain':
      return keys(v, ['kind', 'color']) && member(v.color, CURTAIN_COLORS);
    case 'sliding-door':
      return (
        keys(v, [
          'kind',
          'trigger',
          'mode',
          'color',
          'texture',
          'images',
          'seal',
        ]) &&
        member(v.trigger, ['auto', 'tap']) &&
        member(v.mode, ['texture', 'image']) &&
        color(v.color) &&
        member(v.texture, DOOR_TEXTURES) &&
        images(v.images, 2) &&
        image(v.seal)
      );
    case 'animated-image':
      return (
        keys(v, ['kind', 'title', 'subtitle', 'duration', 'image']) &&
        text(v.title) &&
        text(v.subtitle, 60) &&
        typeof v.duration === 'number' &&
        Number.isFinite(v.duration) &&
        v.duration >= 1 &&
        v.duration <= 10 &&
        image(v.image)
      );
    case 'photobooth':
      return (
        keys(v, [
          'kind',
          ...names,
          'footer',
          'background',
          'color',
          'images',
        ]) &&
        validNames() &&
        text(v.footer) &&
        color(v.background) &&
        color(v.color) &&
        images(v.images, 3)
      );
    default:
      return false;
  }
}
export function openingAssetIds(
  effect: OpeningEffect | null | undefined,
): string[] {
  if (!effect) return [];
  const refs =
    effect.kind === 'animated-image'
      ? [effect.image]
      : effect.kind === 'sliding-door'
        ? [...effect.images, effect.seal]
        : effect.kind === 'intro' || effect.kind === 'photobooth'
          ? effect.images
          : [];
  return [
    ...new Set(refs.flatMap((ref) => (ref.assetId ? [ref.assetId] : []))),
  ].sort();
}
