import type {
  ResolvedSceneV2,
  ValidationIssue,
  TextStyle,
} from '../document/types';
import { fontFamily } from './font-registry';
import { SceneReadinessError } from './measure';
export async function waitForSceneReadyV2(
  root: HTMLElement,
  scene: ResolvedSceneV2,
  signal?: AbortSignal,
  deadline = Date.now() + 10000,
) {
  const pending: Promise<unknown>[] = [];
  for (const node of Object.values(scene.nodes))
    if ('textStyle' in node.content) {
      const style = node.content.textStyle as TextStyle;
      pending.push(
        document.fonts
          .load(
            `${style.italic ? 'italic' : 'normal'} ${style.fontWeight} ${style.fontSize}px ${fontFamily(style.fontId)}`,
            'AgẮệỹ',
          )
          .then((faces) => {
            if (!faces.length || faces.some((f) => f.status !== 'loaded'))
              throw new SceneReadinessError('FONT_UNAVAILABLE');
          })
          .catch(() => {
            throw new SceneReadinessError('FONT_UNAVAILABLE');
          }),
      );
    }
  if (root.querySelector('[data-asset-error]'))
    throw new SceneReadinessError('RENDER_ASSET_NOT_READY');
  for (const image of root.querySelectorAll('img'))
    pending.push(
      image.decode().catch(() => {
        throw new SceneReadinessError('RENDER_ASSET_NOT_READY');
      }),
    );
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    const match = /^url\(["']?(.*?)["']?\)$/.exec(
      getComputedStyle(element).backgroundImage,
    );
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
  pending.push(document.fonts.ready);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    await Promise.race([
      (async () => {
        await Promise.all(pending);
        await new Promise<void>((accept) =>
          requestAnimationFrame(() => requestAnimationFrame(() => accept())),
        );
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new SceneReadinessError('RENDER_ASSET_NOT_READY')),
          Math.max(0, deadline - Date.now()),
        );
        abort = () => reject(new DOMException('Cancelled', 'AbortError'));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      }),
    ]);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (Date.now() > deadline)
      throw new SceneReadinessError('RENDER_ASSET_NOT_READY');
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}
export function measureSceneV2(
  wrapper: HTMLElement,
  scene: ResolvedSceneV2,
): ValidationIssue[] {
  const root = wrapper.matches('[data-invitation-root]')
    ? wrapper
    : wrapper.querySelector<HTMLElement>('[data-invitation-root]');
  if (!root) return [{ path: '/', code: 'ELEMENT_NOT_READY' }];
  const issues: ValidationIssue[] = [];
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width <= 0 || rootRect.height <= 0)
    issues.push({ path: '/', code: 'ELEMENT_NOT_READY' });
  if (rootRect.height > 12000) issues.push({ path: '/', code: 'HEIGHT_LIMIT' });
  const horizontal = (el: HTMLElement) =>
    !el.matches('input,textarea,select') && el.scrollWidth > el.clientWidth + 1;
  if (horizontal(root)) issues.push({ path: '/', code: 'CONTENT_OVERFLOW' });
  for (const sid of scene.sectionOrder) {
    const section = root.querySelector<HTMLElement>(
      `[data-section="${CSS.escape(sid)}"]`,
    );
    const layout = section?.dataset.layout === 'desktop' ? 'desktop' : 'mobile';
    if (!section) {
      issues.push({
        path: `/sections/${sid}`,
        code: 'ELEMENT_NOT_READY',
        sectionId: sid,
        layout,
      });
      continue;
    }
    const sectionRect = section.getBoundingClientRect();
    if (
      horizontal(section) ||
      sectionRect.left < rootRect.left - 1 ||
      sectionRect.right > rootRect.right + 1
    )
      issues.push({
        path: `/sections/${sid}`,
        code: 'CONTENT_OVERFLOW',
        sectionId: sid,
        layout,
      });
    for (const id of scene.sections[sid].flowNodeIds) {
      const frame = section.querySelector<HTMLElement>(
        `[data-rendered-element="${CSS.escape(id)}"]`,
      );
      if (!frame) {
        issues.push({
          path: `/nodes/${id}`,
          code: 'ELEMENT_NOT_READY',
          nodeId: id,
          sectionId: sid,
          layout,
        });
        continue;
      }
      const bounds = frame.getBoundingClientRect();
      const content = [
        frame,
        ...frame.querySelectorAll<HTMLElement>(
          '[data-measure-content],input,textarea,select,button,a,svg,img',
        ),
      ];
      if (
        content.some((el) => {
          const r = el.getBoundingClientRect();
          return (
            horizontal(el) ||
            r.left < bounds.left - 1 ||
            r.right > bounds.right + 1 ||
            r.top < bounds.top - 1 ||
            r.bottom > bounds.bottom + 1
          );
        }) ||
        bounds.left < sectionRect.left - 1 ||
        bounds.right > sectionRect.right + 1
      )
        issues.push({
          path: `/nodes/${id}/content`,
          code: 'CONTENT_OVERFLOW',
          nodeId: id,
          sectionId: sid,
          layout,
        });
    }
  }
  return issues.slice(0, 100);
}
