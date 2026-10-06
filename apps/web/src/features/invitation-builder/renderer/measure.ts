import type { ResolvedScene, TextStyle } from '../document/types';
import { fontFamily } from './font-registry';

export type MeasureIssue = { nodeId?: string; path: string; code: string };
export class SceneReadinessError extends Error {
  constructor(readonly code: 'FONT_UNAVAILABLE' | 'RENDER_ASSET_NOT_READY') {
    super(code);
  }
}
const fontsIn = (scene: ResolvedScene) => [
  ...new Map(
    scene.elements.flatMap((element) => {
      const style = (element.content as unknown as { textStyle?: TextStyle })
        .textStyle;
      return style
        ? [
            [
              `${style.fontId}:${style.fontWeight}:${style.italic}`,
              style,
            ] as const,
          ]
        : [];
    }),
  ).values(),
];

export async function waitForSceneReady(
  root: HTMLElement,
  scene: ResolvedScene,
) {
  const pending: Promise<unknown>[] = [];
  for (const style of fontsIn(scene)) {
    const css = `${style.italic ? 'italic' : 'normal'} ${style.fontWeight} ${style.fontSize}px ${fontFamily(style.fontId)}`;
    pending.push(
      document.fonts
        .load(css, 'AgẮệỹ')
        .then((faces) => {
          if (!faces.length || faces.some((face) => face.status !== 'loaded'))
            throw new SceneReadinessError('FONT_UNAVAILABLE');
        })
        .catch(() => {
          throw new SceneReadinessError('FONT_UNAVAILABLE');
        }),
    );
  }
  if (root.querySelector('[data-asset-error]'))
    pending.push(
      Promise.reject(new SceneReadinessError('RENDER_ASSET_NOT_READY')),
    );
  for (const image of root.querySelectorAll('img')) {
    pending.push(
      image.decode().catch(() => {
        throw new SceneReadinessError('RENDER_ASSET_NOT_READY');
      }),
    );
  }
  // CSS backgrounds are not <img> elements and still need decoded bytes.
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    const background = getComputedStyle(element).backgroundImage;
    const match = /^url\(["']?(.*?)["']?\)$/.exec(background);
    if (match) {
      const image = new Image();
      image.src = match[1];
      pending.push(
        image.decode().catch(() => {
          throw new SceneReadinessError('RENDER_ASSET_NOT_READY');
        }),
      );
    }
  }
  await Promise.all(pending);
  await document.fonts.ready;
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

export function measureScene(
  root: HTMLElement,
  scene: ResolvedScene,
): MeasureIssue[] {
  const issues: MeasureIssue[] = [],
    width = scene.canvas.width,
    height = scene.canvas.height;
  for (const element of scene.elements) {
    const { x, y, width: boxWidth, height: boxHeight, rotation } = element.box;
    const radians = (rotation * Math.PI) / 180,
      cos = Math.cos(radians),
      sin = Math.sin(radians);
    const corners = [
      [0, 0],
      [boxWidth, 0],
      [boxWidth, boxHeight],
      [0, boxHeight],
    ].map(([cx, cy]) => ({
      x:
        x +
        boxWidth / 2 +
        (cx - boxWidth / 2) * cos -
        (cy - boxHeight / 2) * sin,
      y:
        y +
        boxHeight / 2 +
        (cx - boxWidth / 2) * sin +
        (cy - boxHeight / 2) * cos,
    }));
    if (
      corners.some(
        (point) =>
          point.x < -1 ||
          point.y < -1 ||
          point.x > width + 1 ||
          point.y > height + 1,
      )
    )
      issues.push({
        nodeId: element.id,
        path: `/nodes/${element.id}/box`,
        code: 'CANVAS_OVERFLOW',
      });
    const frame = root.querySelector<HTMLElement>(
      `[data-rendered-element="${CSS.escape(element.id)}"]`,
    );
    if (!frame) {
      issues.push({
        nodeId: element.id,
        path: `/nodes/${element.id}`,
        code: 'ELEMENT_NOT_READY',
      });
      continue;
    }
    const measured =
      frame.querySelector<HTMLElement>('[data-measure-content]') ?? frame;
    const style = getComputedStyle(frame);
    const innerWidth = Math.max(
      0,
      frame.clientWidth -
        parseFloat(style.paddingLeft || '0') -
        parseFloat(style.paddingRight || '0'),
    );
    const innerHeight = Math.max(
      0,
      frame.clientHeight -
        parseFloat(style.paddingTop || '0') -
        parseFloat(style.paddingBottom || '0'),
    );
    // Measure content against the authored frame. Comparing a text block to
    // its own auto-sized box misses vertical overflow because the block grows.
    if (
      measured.scrollWidth > innerWidth + 1 ||
      measured.scrollHeight > innerHeight + 1
    )
      issues.push({
        nodeId: element.id,
        path: `/nodes/${element.id}/content`,
        code: 'CONTENT_OVERFLOW',
      });
  }
  return issues;
}

export async function measureReadyScene(
  root: HTMLElement,
  scene: ResolvedScene,
) {
  await waitForSceneReady(root, scene);
  return measureScene(root, scene);
}
