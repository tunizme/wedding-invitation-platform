import type { CanvasNode } from '../document/editor-document';
import { fontFamily } from '../renderer/font-registry';

/** Measures authored typography without depending on canvas zoom or rotation. */
export function createTextMeasurement(node: CanvasNode) {
  if (
    node.type.resolvedName !== 'Text' ||
    !('text' in node.props.content) ||
    typeof document === 'undefined'
  )
    return null;
  const { text, textStyle: style } = node.props.content;
  const { padding, border } = node.props.appearance;
  const position = border.position ?? 'all';
  const horizontalEdges =
    position === 'all' || position === 'horizontal'
      ? 2
      : position === 'left' || position === 'right' || position.includes('-')
        ? 1
        : 0;
  const verticalEdges =
    position === 'all' || position === 'vertical'
      ? 2
      : position === 'top' || position === 'bottom' || position.includes('-')
        ? 1
        : 0;
  const horizontal =
    (padding?.left ?? 0) +
    (padding?.right ?? 0) +
    border.width * horizontalEdges;
  const vertical =
    (padding?.top ?? 0) + (padding?.bottom ?? 0) + border.width * verticalEdges;
  const probe = document.createElement('div');
  probe.textContent = text || ' ';
  Object.assign(probe.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    width: '1px',
    height: 'auto',
    margin: '0',
    padding: '0',
    border: '0',
    fontFamily: fontFamily(style.fontId),
    fontSize: `${style.fontSize}px`,
    fontWeight: String(style.fontWeight),
    fontStyle: style.italic ? 'italic' : 'normal',
    letterSpacing: `${style.letterSpacing}px`,
    lineHeight: String(style.lineHeight),
    textTransform: style.textTransform,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSynthesis: 'none',
  });
  document.body.append(probe);
  const minWidth = Math.ceil(probe.scrollWidth + horizontal);
  const lineHeight = Math.ceil(style.fontSize * style.lineHeight + vertical);
  return {
    minWidth,
    lineHeight,
    heightAt(width: number) {
      probe.style.width = `${Math.max(1, width - horizontal)}px`;
      return Math.max(lineHeight, Math.ceil(probe.scrollHeight + vertical));
    },
    dispose() {
      probe.remove();
    },
  };
}

export function textMinimumBox(node: CanvasNode) {
  const measurement = createTextMeasurement(node);
  if (!measurement) return null;
  try {
    const width = Math.max(node.props.box.width, measurement.minWidth);
    return { width, height: measurement.heightAt(width) };
  } finally {
    measurement.dispose();
  }
}
