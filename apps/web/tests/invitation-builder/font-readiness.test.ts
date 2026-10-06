import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForSceneReady } from '../../src/features/invitation-builder/renderer/measure';
import type {
  ResolvedScene,
  TextStyle,
} from '../../src/features/invitation-builder/document/types';
const oldFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
const style: TextStyle = {
  fontId: 'noto-sans-v1',
  fontSize: 18,
  fontWeight: 400,
  italic: false,
  underline: false,
  color: '#000000FF',
  letterSpacing: 0,
  lineHeight: 1.5,
  textAlign: 'left',
  textTransform: 'none',
};
const scene = {
  elements: [
    { content: { textStyle: { ...style, fontWeight: 700, italic: true } } },
    { content: { textStyle: style } },
  ],
} as unknown as ResolvedScene;
afterEach(() => {
  vi.unstubAllGlobals();
  if (oldFonts) Object.defineProperty(document, 'fonts', oldFonts);
  else Reflect.deleteProperty(document, 'fonts');
});
describe('face-specific readiness', () => {
  it('loads both regular and bold italic including Latin and Vietnamese samples', async () => {
    const load = vi.fn().mockResolvedValue([{ status: 'loaded' }]);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load, ready: Promise.resolve() },
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    await waitForSceneReady(document.createElement('div'), scene);
    expect(load).toHaveBeenCalledWith(
      expect.stringContaining('italic 700'),
      'AgẮệỹ',
    );
    expect(load).toHaveBeenCalledWith(
      expect.stringContaining('normal 400'),
      'AgẮệỹ',
    );
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('rejects a missing italic face even though the regular face loads', async () => {
    const load = vi.fn((css: string) =>
      css.startsWith('italic')
        ? Promise.reject(new Error('blocked'))
        : Promise.resolve([{ status: 'loaded' }]),
    );
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load, ready: Promise.resolve() },
    });
    await expect(
      waitForSceneReady(document.createElement('div'), scene),
    ).rejects.toMatchObject({ code: 'FONT_UNAVAILABLE' });
  });
});
