import { describe, expect, it } from 'vitest';
import {
  aspectRatio,
  autoCropRect,
  moveCropRect,
  normalizeCrop,
  resizeCropRect,
} from '../../src/features/invitation-builder/editor/crop-geometry';

// Reference cropper on a 552×368 displayed image (docs/cinelove/hinh-anh.md R07).
const W = 552,
  H = 368;
const rounded = (rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => [rect.x, rect.y, rect.width, rect.height].map(Math.round);

describe('crop ratio presets', () => {
  it('reset to the largest centred box inside 80% of the image', () => {
    expect(rounded(autoCropRect(W, H, aspectRatio('free')))).toEqual([
      55, 37, 442, 294,
    ]);
    expect(rounded(autoCropRect(W, H, aspectRatio('1:1')))).toEqual([
      129, 37, 294, 294,
    ]);
    expect(rounded(autoCropRect(W, H, aspectRatio('2:3')))).toEqual([
      178, 37, 196, 294,
    ]);
    expect(rounded(autoCropRect(W, H, aspectRatio('4:3')))).toEqual([
      80, 37, 393, 294,
    ]);
    expect(rounded(autoCropRect(W, H, aspectRatio('16:9')))).toEqual([
      55, 60, 442, 248,
    ]);
  });
});

describe('crop box dragging', () => {
  const start = autoCropRect(W, H, null);
  it('moves inside the image only', () => {
    const moved = moveCropRect(start, -500, 500, W, H);
    expect(moved.x).toBe(0);
    expect(moved.y + moved.height).toBeCloseTo(H);
  });
  it('resizes one edge freely and clamps to the image', () => {
    const wider = resizeCropRect(start, 'e', 1000, 0, W, H, null);
    expect(wider.x).toBeCloseTo(start.x);
    expect(wider.x + wider.width).toBeCloseTo(W);
    expect(wider.height).toBeCloseTo(start.height);
  });
  it('keeps a locked ratio and stays inside the image', () => {
    const square = autoCropRect(W, H, 1);
    for (const handle of ['se', 'nw', 'n', 'e'] as const) {
      const next = resizeCropRect(square, handle, 400, 400, W, H, 1);
      expect(next.width / next.height).toBeCloseTo(1);
      expect(next.x).toBeGreaterThanOrEqual(-0.001);
      expect(next.y).toBeGreaterThanOrEqual(-0.001);
      expect(next.x + next.width).toBeLessThanOrEqual(W + 0.001);
      expect(next.y + next.height).toBeLessThanOrEqual(H + 0.001);
    }
  });
});

describe('stored crop', () => {
  it('omits a crop covering the whole image and normalizes the rest', () => {
    expect(
      normalizeCrop({ x: 0, y: 0, width: W, height: H }, W, H),
    ).toBeUndefined();
    expect(normalizeCrop(autoCropRect(W, H, null), W, H)).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    });
  });
});
