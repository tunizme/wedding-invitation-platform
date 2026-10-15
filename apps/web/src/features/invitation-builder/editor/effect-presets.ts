import type {
  CanvasNode,
  EditorDocument,
  NodeOptions,
} from '../document/editor-document';
export type PagePreset = NonNullable<
  EditorDocument['settings']['pageAnimation']
>;
export const PAGE_PRESETS: readonly {
  value: PagePreset;
  label: string;
  icon: string;
  duration: number;
  delay: number;
}[] = [
  { value: 'none', label: 'None', icon: 'none', duration: 0, delay: 0 },
  {
    value: 'fade-all',
    label: 'Fade In All',
    icon: 'fade-in-all',
    duration: 1.6,
    delay: 0,
  },
  {
    value: 'slide-all',
    label: 'Slide Up All',
    icon: 'slide-up-all',
    duration: 1.5,
    delay: 0,
  },
  {
    value: 'scale-all',
    label: 'Scale In All',
    icon: 'scale-in-all',
    duration: 1.2,
    delay: 0,
  },
  {
    value: 'flip-all',
    label: 'Flip In All',
    icon: 'flip-in-all',
    duration: 1.6,
    delay: 0,
  },
  {
    value: 'slide-mix',
    label: 'Slide Up Mix',
    icon: 'slide-up-mix',
    duration: 1.3,
    delay: 0,
  },
  {
    value: 'fade-mix',
    label: 'Fade In Mix',
    icon: 'fade-in-mix',
    duration: 1.5,
    delay: 0.2,
  },
];
/** One replace command materializes the preset, so new nodes do not inherit it. */
export function applyPagePreset(
  document: EditorDocument,
  value: PagePreset,
): EditorDocument {
  const next = structuredClone(document);
  const preset = PAGE_PRESETS.find((p) => p.value === value)!;
  for (const id of next.nodes.ROOT.nodes) {
    const node = next.nodes[id] as CanvasNode;
    let entrance: NodeOptions['entrance'] =
      value === 'none'
        ? 'none'
        : value === 'scale-all'
          ? 'scale'
          : value === 'flip-all'
            ? 'flip'
            : value === 'slide-all' || value === 'slide-mix'
              ? 'slide'
              : 'fade';
    if (value === 'slide-mix' || value === 'fade-mix') {
      const center = node.props.box.x + node.props.box.width / 2;
      // Outer thirds are an explicit reconstruction; center/right were measured.
      if (center < 500 / 3) entrance = 'slide-right';
      else if (center > 1000 / 3) entrance = 'slide-left';
    }
    next.nodeOptions[id] = {
      ...next.nodeOptions[id],
      entrance,
      entranceEnabled: value !== 'none',
      entranceDuration: Math.max(0.1, preset.duration),
      entranceDelay: preset.delay,
      entranceEasing: 'ease-out',
    };
  }
  next.settings.pageAnimation = 'none';
  return next;
}
