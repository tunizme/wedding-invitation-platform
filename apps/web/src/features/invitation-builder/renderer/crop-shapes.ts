import type { CSSProperties } from 'react';
import type { CropShape } from '../document/editor-document';

// Project-drawn crop shapes in a 100×100 box. They stretch with the element
// (preserveAspectRatio="none"), like the reference editor's shape masks.
type Drawn = (fill: string, id: string) => string;
const polygon =
  (points: string): Drawn =>
  (fill) =>
    `<polygon points="${points}" fill="${fill}"/>`;
const path =
  (d: string): Drawn =>
  (fill) =>
    `<path d="${d}" fill="${fill}"/>`;
const rect =
  (rx: number, ry = rx): Drawn =>
  (fill) =>
    `<rect width="100" height="100" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const fade =
  (x1: number, y1: number, x2: number, y2: number): Drawn =>
  (fill, id) =>
    `<defs><linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0.55" stop-color="${fill}"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></linearGradient></defs><rect width="100" height="100" fill="url(#${id})"/>`;

const SHAPES: Record<Exclude<CropShape, 'none'>, Drawn> = {
  circle: (fill) => `<ellipse cx="50" cy="50" rx="50" ry="50" fill="${fill}"/>`,
  arch: path('M0 50A50 50 0 0 1 100 50V100H0Z'),
  heart: polygon('50,95 0,35 5,10 25,0 50,20 75,0 95,10 100,35'),
  'rounded-sm': rect(8),
  'rounded-md': rect(16),
  'rounded-lg': rect(28),
  dome: path('M0 40Q0 0 40 0H60Q100 0 100 40V100H0Z'),
  'arch-bottom': path('M0 0H100V50A50 50 0 0 1 0 50Z'),
  pill: rect(20, 50),
  leaf: path('M40 0H100V60Q100 100 60 100H0V40Q0 0 40 0Z'),
  'leaf-alt': path('M0 0H60Q100 0 100 40V100H40Q0 100 0 60Z'),
  chamfer: polygon('15,0 85,0 100,15 100,85 85,100 15,100 0,85 0,15'),
  'slant-top': polygon('0,15 100,0 100,100 0,100'),
  'slant-bottom': polygon('0,0 100,0 100,85 0,100'),
  trapezoid: polygon('12,0 88,0 100,100 0,100'),
  parallelogram: polygon('15,0 100,0 85,100 0,100'),
  diamond: polygon('50,0 100,50 50,100 0,50'),
  hexagon: polygon('25,0 75,0 100,50 75,100 25,100 0,50'),
  star: polygon('50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35'),
  wave: path(
    'M0 8Q12.5 0 25 8T50 8T75 8T100 8V92Q87.5 100 75 92T50 92T25 92T0 92Z',
  ),
  'fade-top': fade(0, 1, 0, 0),
  'fade-bottom': fade(0, 0, 0, 1),
  'fade-left': fade(1, 0, 0, 0),
  'fade-right': fade(0, 0, 1, 0),
  vignette: (fill, id) =>
    `<defs><radialGradient id="${id}"><stop offset="0.6" stop-color="${fill}"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#${id})"/>`,
};

export const CROP_SHAPE_LABELS: Record<CropShape, string> = {
  none: 'Không cắt hình',
  circle: 'Hình tròn',
  arch: 'Vòm',
  heart: 'Trái tim',
  'rounded-sm': 'Bo góc nhỏ',
  'rounded-md': 'Bo góc vừa',
  'rounded-lg': 'Bo góc lớn',
  dome: 'Mái vòm thấp',
  'arch-bottom': 'Vòm dưới',
  pill: 'Viên thuốc',
  leaf: 'Chiếc lá',
  'leaf-alt': 'Chiếc lá ngược',
  chamfer: 'Vát góc',
  'slant-top': 'Vát cạnh trên',
  'slant-bottom': 'Vát cạnh dưới',
  trapezoid: 'Hình thang',
  parallelogram: 'Hình bình hành',
  diamond: 'Hình thoi',
  hexagon: 'Lục giác',
  star: 'Ngôi sao',
  wave: 'Gợn sóng',
  'fade-top': 'Mờ cạnh trên',
  'fade-bottom': 'Mờ cạnh dưới',
  'fade-left': 'Mờ cạnh trái',
  'fade-right': 'Mờ cạnh phải',
  vignette: 'Mờ viền',
};

export function cropShapeSvg(shape: Exclude<CropShape, 'none'>, fill: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${SHAPES[shape](fill, `g-${shape}`)}</svg>`;
}

export function cropShapeUrl(shape: Exclude<CropShape, 'none'>, fill = '#000') {
  return `url("data:image/svg+xml,${encodeURIComponent(cropShapeSvg(shape, fill))}")`;
}

/** Mask applied to the image content box; `none`/missing leaves it untouched. */
export function cropShapeStyle(shape: CropShape | undefined): CSSProperties {
  if (!shape || shape === 'none') return {};
  const image = cropShapeUrl(shape);
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
  };
}
