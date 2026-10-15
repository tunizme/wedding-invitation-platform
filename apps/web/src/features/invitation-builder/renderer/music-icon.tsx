import { Disc3, Music, Music2, Music3, Music4, Volume2 } from 'lucide-react';

export const MUSIC_ICON_CHOICES = [
  { label: 'Nốt nhạc đôi', Glyph: Music2 },
  { label: 'Nốt nhạc', Glyph: Music },
  { label: 'Nốt nhạc ba', Glyph: Music3 },
  { label: 'Nốt nhạc bốn', Glyph: Music4 },
  { label: 'Đĩa nhạc', Glyph: Disc3 },
  { label: 'Loa', Glyph: Volume2 },
] as const;

export function MusicIcon({
  index = 0,
  size = 24,
}: {
  index?: number;
  size?: number;
}) {
  const Glyph = MUSIC_ICON_CHOICES[index]?.Glyph ?? Music2;
  return <Glyph size={size} aria-hidden="true" />;
}
