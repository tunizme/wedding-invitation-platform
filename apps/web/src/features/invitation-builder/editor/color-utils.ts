export interface Hsva {
  h: number;
  s: number;
  v: number;
  a: number;
}
export function hexToHsva(hex: string): Hsva {
  const normalized = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)
    ? hex
    : '#000000FF';
  const channels = [1, 3, 5].map(
    (offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255,
  );
  const [r, g, b] = channels;
  const max = Math.max(...channels),
    min = Math.min(...channels),
    delta = max - min;
  const h =
    delta === 0
      ? 0
      : max === r
        ? 60 * (((g - b) / delta) % 6)
        : max === g
          ? 60 * ((b - r) / delta + 2)
          : 60 * ((r - g) / delta + 4);
  return {
    h: (h + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
    a: normalized.length === 9 ? parseInt(normalized.slice(7, 9), 16) / 255 : 1,
  };
}
export function hsvaToHex({ h, s, v, a }: Hsva): string {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const channels =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return (
    '#' +
    [...channels.map((value) => value + m), a]
      .map((value) =>
        Math.round(Math.min(1, Math.max(0, value)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}
