// Pinned invitation font catalog. Keep API/web copies identical; tested against the asset manifest.
export const FONT_IDS = [
  'noto-sans-v1',
  'noto-serif-v1',
  'be-vietnam-pro-v1',
  'inter-v1',
  'montserrat-v1',
  'nunito-v1',
  'nunito-sans-v1',
  'quicksand-v1',
  'raleway-v1',
  'oswald-v1',
  'merriweather-v1',
  'lora-v1',
  'cormorant-garamond-v1',
  'eb-garamond-v1',
  'bitter-v1',
  'crimson-pro-v1',
  'dancing-script-v1',
  'great-vibes-v1',
  'allura-v1',
  'moon-dance-v1',
  'style-script-v1',
  'charm-v1',
  'bai-jamjuree-v1',
  'mali-v1',
  'sriracha-v1',
  'ibm-plex-serif-v1',
] as const;
export type InvitationFontId = (typeof FONT_IDS)[number];
export interface InvitationFont {
  id: InvitationFontId;
  label: string;
  family: string;
  category: string;
  weights: readonly (400 | 700)[];
  styles: readonly ('normal' | 'italic')[];
  faces: readonly { weight: 400 | 700; style: 'normal' | 'italic' }[];
}
export const FONT_CATALOG: readonly InvitationFont[] = [
  {
    id: 'noto-sans-v1',
    label: 'Noto Sans',
    family: 'Invitation Noto Sans v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'noto-serif-v1',
    label: 'Noto Serif',
    family: 'Invitation Noto Serif v1',
    category: 'serif',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'be-vietnam-pro-v1',
    label: 'Be Vietnam Pro',
    family: 'Invitation Be Vietnam Pro v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'inter-v1',
    label: 'Inter',
    family: 'Invitation Inter v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'montserrat-v1',
    label: 'Montserrat',
    family: 'Invitation Montserrat v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'nunito-v1',
    label: 'Nunito',
    family: 'Invitation Nunito v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'nunito-sans-v1',
    label: 'Nunito Sans',
    family: 'Invitation Nunito Sans v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'quicksand-v1',
    label: 'Quicksand',
    family: 'Invitation Quicksand v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
    ],
  },
  {
    id: 'raleway-v1',
    label: 'Raleway',
    family: 'Invitation Raleway v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'oswald-v1',
    label: 'Oswald',
    family: 'Invitation Oswald v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
    ],
  },
  {
    id: 'merriweather-v1',
    label: 'Merriweather',
    family: 'Invitation Merriweather v1',
    category: 'serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'lora-v1',
    label: 'Lora',
    family: 'Invitation Lora v1',
    category: 'serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'cormorant-garamond-v1',
    label: 'Cormorant Garamond',
    family: 'Invitation Cormorant Garamond v1',
    category: 'serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'eb-garamond-v1',
    label: 'EB Garamond',
    family: 'Invitation EB Garamond v1',
    category: 'serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'bitter-v1',
    label: 'Bitter',
    family: 'Invitation Bitter v1',
    category: 'serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'crimson-pro-v1',
    label: 'Crimson Pro',
    family: 'Invitation Crimson Pro v1',
    category: 'serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'dancing-script-v1',
    label: 'Dancing Script',
    family: 'Invitation Dancing Script v1',
    category: 'handwriting',
    weights: [400, 700],
    styles: ['normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
    ],
  },
  {
    id: 'great-vibes-v1',
    label: 'Great Vibes',
    family: 'Invitation Great Vibes v1',
    category: 'handwriting',
    weights: [400],
    styles: ['normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
    ],
  },
  {
    id: 'allura-v1',
    label: 'Allura',
    family: 'Invitation Allura v1',
    category: 'handwriting',
    weights: [400],
    styles: ['normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
    ],
  },
  {
    id: 'moon-dance-v1',
    label: 'Moon Dance',
    family: 'Invitation Moon Dance v1',
    category: 'handwriting',
    weights: [400],
    styles: ['normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
    ],
  },
  {
    id: 'style-script-v1',
    label: 'Style Script',
    family: 'Invitation Style Script v1',
    category: 'handwriting',
    weights: [400],
    styles: ['normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
    ],
  },
  {
    id: 'charm-v1',
    label: 'Charm',
    family: 'Invitation Charm v1',
    category: 'handwriting',
    weights: [400, 700],
    styles: ['normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
    ],
  },
  {
    id: 'bai-jamjuree-v1',
    label: 'Bai Jamjuree',
    family: 'Invitation Bai Jamjuree v1',
    category: 'sans-serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'mali-v1',
    label: 'Mali',
    family: 'Invitation Mali v1',
    category: 'handwriting',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
  {
    id: 'sriracha-v1',
    label: 'Sriracha',
    family: 'Invitation Sriracha v1',
    category: 'handwriting',
    weights: [400],
    styles: ['normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
    ],
  },
  {
    id: 'ibm-plex-serif-v1',
    label: 'IBM Plex Serif',
    family: 'Invitation IBM Plex Serif v1',
    category: 'serif',
    weights: [400, 700],
    styles: ['italic', 'normal'],
    faces: [
      {
        weight: 400,
        style: 'normal',
      },
      {
        weight: 700,
        style: 'normal',
      },
      {
        weight: 400,
        style: 'italic',
      },
      {
        weight: 700,
        style: 'italic',
      },
    ],
  },
];
export function getInvitationFont(id: InvitationFontId): InvitationFont {
  return FONT_CATALOG.find((font) => font.id === id) ?? FONT_CATALOG[0];
}
export function supportsFontFace(
  id: InvitationFontId,
  weight: number,
  italic: boolean,
): boolean {
  return getInvitationFont(id).faces.some(
    (face) =>
      face.weight === weight && face.style === (italic ? 'italic' : 'normal'),
  );
}
