import type {
  ElementNode,
  LeafV2,
  SectionRule,
  SupportedTemplateDesign,
  TemplateDesignV2,
} from '../../web/src/features/invitation-builder/document/types';
import { createDesign, templates, type TemplateFixture } from './fixtures';

/** Explicitly authored section composition for prototype samples, not a v1 migration. */
export function createPrototypeDesign(
  template: TemplateFixture,
): SupportedTemplateDesign {
  if (template.id === templates[3].id) return createDesign(template);
  return createResponsiveDesign(template);
}
export function createResponsiveDesign(
  template: TemplateFixture,
): TemplateDesignV2 {
  const legacy = createDesign(template);
  const ids = legacy.nodes.ROOT.nodes;
  const nodes: TemplateDesignV2['nodes'] = {};
  for (const id of ids) {
    const source = legacy.nodes[id] as ElementNode;
    const type = source.type.resolvedName;
    nodes[id] = {
      id,
      type,
      role: 'flow',
      hidden: source.hidden,
      custom: structuredClone(source.custom),
      bindings: structuredClone(source.props.bindings),
      appearance: structuredClone(source.props.appearance),
      content: {
        ...structuredClone(source.props.content),
        ...(type === 'Image'
          ? {
              aspectRatio: id === ids[4] ? 1.25 : 0.8,
              alt:
                id === ids[4]
                  ? 'Ảnh kỷ niệm của đôi uyên ương'
                  : id === ids[21]
                    ? 'Ảnh cô dâu'
                    : 'Ảnh chú rể',
            }
          : {}),
      },
      mobile: {
        layout: { widthPercent: 100, maxWidth: null, align: 'center' },
        typography: {},
        appearance: {},
      },
      desktop: {
        ...(['Text'].includes(type) && 'textStyle' in source.props.content
          ? {
              typography: {
                fontSize:
                  source.props.content.textStyle.fontSize >= 26
                    ? source.props.content.textStyle.fontSize + 8
                    : source.props.content.textStyle.fontSize,
              },
            }
          : {}),
      },
    } as LeafV2;
  }
  const design: TemplateDesignV2 = {
    schemaVersion: 2,
    viewport: {
      mobileMaxWidth: 480,
      desktopMinWidth: 768,
      desktopMaxWidth: 900,
    },
    background: structuredClone(legacy.nodes.ROOT.props.canvas.background),
    sectionOrder: [],
    sections: {},
    nodes,
  };
  function section(
    label: string,
    indices: number[],
    preset: SectionRule['contentPreset'],
    grid = false,
  ) {
    const id = `60000000-0000-4000-8000-${String(design.sectionOrder.length + 1).padStart(12, '0')}`;
    design.sectionOrder.push(id);
    design.sections[id] = {
      id,
      label,
      hidden: false,
      background: { kind: 'solid', color: '#FFFFFF00' },
      flowNodeIds: indices.map((i) => ids[i]),
      artworkNodeIds: [],
      mobile: {
        layout: 'stack',
        columns: 1,
        contentPreset: preset,
        customMaxWidth: null,
        padding: {
          top: 32,
          right: preset === 'information' ? 0 : 24,
          bottom: 32,
          left: preset === 'information' ? 0 : 24,
        },
        gap: 16,
        minHeight: 0,
        align: 'center',
      },
      desktop: {
        padding: { top: 48, bottom: 48 },
        gap: 24,
        ...(grid ? { layout: 'grid', columns: 2 } : {}),
      },
    };
    return id;
  }
  section('Lời mở đầu', [0, 1, 2, 3], 'story');
  const hero = section('Ảnh đầu thiệp', [4], 'full');
  design.sections[hero].mobile.padding = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
  design.sections[hero].desktop.padding = { top: 0, bottom: 0 };
  section('Thông tin lễ cưới', [5, 6, 7, 8, 9, 10], 'information');
  section('Câu chuyện của chúng mình', [11, 12, 13], 'story');
  if (ids.length > 16) {
    section('Gia đình hai bên', [16, 17, 18, 19, 20], 'information');
    section('Ảnh đôi', [21, 22], 'full', true);
    section('Mừng cưới', [23, 24], 'form');
  } else {
    // Two explicitly authored photo leaves demonstrate the same album behavior on every v2 sample.
    const albumIds = [1, 2].map((n) => {
      const id = `61000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      nodes[id] = structuredClone(nodes[ids[4]]);
      nodes[id].id = id;
      nodes[id].bindings = [];
      if (nodes[id].type === 'Image')
        nodes[id].content.alt = `Ảnh kỷ niệm ${n}`;
      return id;
    });
    const album = section('Ảnh đôi', [], 'full', true);
    design.sections[album].flowNodeIds = albumIds;
  }
  section('Xác nhận tham dự', [14], 'form');
  section('Lời cảm ơn', [15], 'story');
  return design;
}
