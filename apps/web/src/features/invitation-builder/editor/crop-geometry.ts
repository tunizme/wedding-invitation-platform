import type { CropAspect } from '../document/editor-document';

/** Crop rectangle in displayed-image pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_SIZE = 10;
// The reference cropper starts and resets at 80% of the image.
const AUTO_AREA = 0.8;

export function aspectRatio(aspect: CropAspect | undefined): number | null {
  if (!aspect || aspect === 'free') return null;
  const [w, h] = aspect.split(':').map(Number);
  return w / h;
}

/** Largest box of `ratio` inside 80% of the image, centred on the image. */
export function autoCropRect(
  imageWidth: number,
  imageHeight: number,
  ratio: number | null,
): CropRect {
  let width = imageWidth * AUTO_AREA,
    height = imageHeight * AUTO_AREA;
  if (ratio) {
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }
  return {
    x: (imageWidth - width) / 2,
    y: (imageHeight - height) / 2,
    width,
    height,
  };
}

export function moveCropRect(
  rect: CropRect,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): CropRect {
  return {
    ...rect,
    x: Math.min(imageWidth - rect.width, Math.max(0, rect.x + dx)),
    y: Math.min(imageHeight - rect.height, Math.max(0, rect.y + dy)),
  };
}

/** Drags one edge or corner; a ratio keeps its proportion within the image. */
export function resizeCropRect(
  rect: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
  ratio: number | null,
): CropRect {
  let left = rect.x,
    top = rect.y,
    right = rect.x + rect.width,
    bottom = rect.y + rect.height;
  if (handle.includes('w'))
    left = Math.min(right - MIN_SIZE, Math.max(0, left + dx));
  if (handle.includes('e'))
    right = Math.max(left + MIN_SIZE, Math.min(imageWidth, right + dx));
  if (handle.includes('n'))
    top = Math.min(bottom - MIN_SIZE, Math.max(0, top + dy));
  if (handle.includes('s'))
    bottom = Math.max(top + MIN_SIZE, Math.min(imageHeight, bottom + dy));
  if (!ratio)
    return { x: left, y: top, width: right - left, height: bottom - top };
  // Size follows the dragged axis; the opposite edge or centre stays anchored.
  const horizontal = handle === 'e' || handle === 'w';
  const vertical = handle === 'n' || handle === 's';
  let width = right - left,
    height = bottom - top;
  if (vertical) width = height * ratio;
  else if (horizontal) height = width / ratio;
  else if (width / height > ratio) height = width / ratio;
  else width = height * ratio;
  const anchorX = handle.includes('w')
    ? right
    : handle.includes('e')
      ? left
      : rect.x + rect.width / 2;
  const anchorY = handle.includes('n')
    ? bottom
    : handle.includes('s')
      ? top
      : rect.y + rect.height / 2;
  const fromX = handle.includes('w')
    ? 'right'
    : handle.includes('e')
      ? 'left'
      : 'center';
  const fromY = handle.includes('n')
    ? 'bottom'
    : handle.includes('s')
      ? 'top'
      : 'center';
  const roomX =
    fromX === 'right'
      ? anchorX
      : fromX === 'left'
        ? imageWidth - anchorX
        : 2 * Math.min(anchorX, imageWidth - anchorX);
  const roomY =
    fromY === 'bottom'
      ? anchorY
      : fromY === 'top'
        ? imageHeight - anchorY
        : 2 * Math.min(anchorY, imageHeight - anchorY);
  const scale = Math.min(1, roomX / width, roomY / height);
  width = Math.max(MIN_SIZE, width * scale);
  height = Math.max(MIN_SIZE, height * scale);
  const x =
    fromX === 'right'
      ? anchorX - width
      : fromX === 'left'
        ? anchorX
        : anchorX - width / 2;
  const y =
    fromY === 'bottom'
      ? anchorY - height
      : fromY === 'top'
        ? anchorY
        : anchorY - height / 2;
  return { x, y, width, height };
}

/** Normalized crop stored in node options (0–1 of the original image). */
export function normalizeCrop(
  rect: CropRect,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } | undefined {
  const round = (value: number) => Math.round(value * 10000) / 10000;
  const crop = {
    x: round(rect.x / imageWidth),
    y: round(rect.y / imageHeight),
    width: round(rect.width / imageWidth),
    height: round(rect.height / imageHeight),
  };
  crop.width = Math.max(0.01, Math.min(crop.width, 1 - crop.x));
  crop.height = Math.max(0.01, Math.min(crop.height, 1 - crop.y));
  const whole =
    crop.x <= 0.0005 &&
    crop.y <= 0.0005 &&
    crop.width >= 0.9995 &&
    crop.height >= 0.9995;
  return whole ? undefined : crop;
}

export function denormalizeCrop(
  crop: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): CropRect {
  return {
    x: crop.x * imageWidth,
    y: crop.y * imageHeight,
    width: crop.width * imageWidth,
    height: crop.height * imageHeight,
  };
}
