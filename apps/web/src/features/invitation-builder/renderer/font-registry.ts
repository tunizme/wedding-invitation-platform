import manifest from '../../../../public/fonts/invitation-builder/manifest.json';

export const FONT_IDS = ['noto-sans-v1', 'noto-serif-v1'] as const;
export type InvitationFontId = (typeof FONT_IDS)[number];
export const FONT_FACES = manifest.faces;

export function fontFamily(id: InvitationFontId): string {
  return id === 'noto-serif-v1'
    ? '"Invitation Noto Serif v1"'
    : '"Invitation Noto Sans v1"';
}

/** Caller supplies its document so capture and editor use the same font gate. */
export async function loadInvitationFonts(document: Document): Promise<void> {
  await Promise.all(
    FONT_FACES.map(async (face) => {
      const loaded = await document.fonts.load(
        `${face.style} ${face.weight} 18px "${face.family}"`,
        'Thiệp cưới Đặng Nguyễn Ắ ệ ỹ',
      );
      if (
        loaded.length === 0 ||
        loaded.some((font) => font.status !== 'loaded')
      ) {
        throw new Error('FONT_UNAVAILABLE');
      }
    }),
  );
  await document.fonts.ready;
}
