import manifest from '../../../../public/fonts/invitation-builder/manifest.json';
import {
  getInvitationFont,
  type InvitationFontId,
} from '../document/font-catalog';
import type { TextStyle } from '../document/types';
export { FONT_IDS, type InvitationFontId } from '../document/font-catalog';
export const FONT_FACES = manifest.faces;

export function fontFamily(id: InvitationFontId): string {
  return JSON.stringify(getInvitationFont(id).family);
}

/** Load only the face being applied before measuring authored text. */
export async function loadInvitationFontFace(
  document: Document,
  style: Pick<TextStyle, 'fontId' | 'fontSize' | 'fontWeight' | 'italic'>,
): Promise<void> {
  const faces = await document.fonts.load(
    `${style.italic ? 'italic' : 'normal'} ${style.fontWeight} ${style.fontSize}px ${fontFamily(style.fontId)}`,
    'AgẮệỹ',
  );
  if (!faces.length || faces.some((face) => face.status !== 'loaded'))
    throw new Error('FONT_UNAVAILABLE');
}

/** Explicit font ids keep catalog growth from preloading every available family. */
export async function loadInvitationFonts(
  document: Document,
  ids: readonly InvitationFontId[] = ['noto-sans-v1', 'noto-serif-v1'],
): Promise<void> {
  await Promise.all(
    FONT_FACES.filter((face) =>
      ids.includes(face.fontId as InvitationFontId),
    ).map((face) =>
      loadInvitationFontFace(document, {
        fontId: face.fontId as InvitationFontId,
        fontSize: 18,
        fontWeight: face.weight as 400 | 700,
        italic: face.style === 'italic',
      }),
    ),
  );
  await document.fonts.ready;
}
