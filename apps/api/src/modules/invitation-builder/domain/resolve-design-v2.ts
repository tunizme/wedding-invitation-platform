import type {
  TemplateDesignV2,
  TemplateDesign,
  ElementNode,
  WeddingData,
  ResolvedSceneV2,
  ResolvedLeafV2,
  ResolvedSectionV2,
  ValidationIssue,
} from './document.types';
import { resolveDesignV1 } from './resolve-design';
export type ResolutionV2 = {
  scene: ResolvedSceneV2;
  issues: ValidationIssue[];
  visibleAssetIds: string[];
  hasVisibleRsvp: boolean;
};
export function resolveDesignV2(
  document: TemplateDesignV2,
  data: WeddingData,
  options: Parameters<typeof resolveDesignV1>[2],
): ResolutionV2 {
  const sectionOrder: string[] = [],
    sections: Record<string, ResolvedSectionV2> = {},
    nodes: Record<string, ResolvedLeafV2> = {},
    issues: ValidationIssue[] = [],
    assets = new Set<string>();
  const asset = (background: TemplateDesignV2['background']) => {
    if (background.kind === 'asset') assets.add(background.assetId);
  };
  asset(document.background);
  for (const sid of document.sectionOrder) {
    const section = document.sections[sid];
    if (section.hidden) continue;
    const retained: string[] = [];
    const legacyNodes: TemplateDesign['nodes'] = {
      ROOT: {
        type: { resolvedName: 'InvitationCanvas' },
        isCanvas: true,
        displayName: 'InvitationCanvas',
        custom: {},
        hidden: false,
        nodes: [...section.flowNodeIds, ...section.artworkNodeIds],
        linkedNodes: {},
        props: {
          canvas: {
            width: 390,
            height: 12000,
            background: { kind: 'solid', color: '#FFFFFF00' },
          },
        },
      },
    };
    for (const id of legacyNodes.ROOT.nodes) {
      const node = document.nodes[id];
      legacyNodes[id] = {
        type: { resolvedName: node.type },
        isCanvas: false,
        displayName: node.type,
        custom: node.custom,
        hidden: node.hidden,
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
        props: {
          box: { x: 0, y: 0, width: 390, height: 390, rotation: 0 },
          appearance: node.appearance,
          content: node.content,
          bindings: node.bindings,
        },
      } as ElementNode;
    }
    const result = resolveDesignV1(
      { schemaVersion: 1, nodes: legacyNodes },
      data,
      options,
    );
    issues.push(...result.issues.map((e) => ({ ...e, sectionId: sid })));
    for (const element of result.scene.elements) {
      const source = document.nodes[element.id];
      nodes[element.id] = {
        id: element.id,
        type: element.type,
        role: source.role,
        content: element.content,
        appearance: structuredClone(element.appearance),
        mobile: structuredClone(source.mobile),
        desktop: structuredClone(source.desktop),
      } as ResolvedLeafV2;
      retained.push(element.id);
    }
    const flowNodeIds = section.flowNodeIds.filter((id) =>
      retained.includes(id),
    );
    if (!flowNodeIds.length) {
      for (const id of retained) delete nodes[id];
      continue;
    }
    const artworkNodeIds = section.artworkNodeIds.filter((id) =>
      retained.includes(id),
    );
    sections[sid] = {
      id: sid,
      background: structuredClone(section.background),
      flowNodeIds,
      artworkNodeIds,
      mobile: structuredClone(section.mobile),
      desktop: structuredClone(section.desktop),
    };
    sectionOrder.push(sid);
    asset(section.background);
    for (const id of result.visibleAssetIds) assets.add(id);
  }
  if (!sectionOrder.length)
    issues.push({ path: '/sections', code: 'EMPTY_SCENE' });
  const scene: ResolvedSceneV2 = {
    schemaVersion: 2,
    rendererContractVersion: 2,
    viewport: structuredClone(document.viewport),
    background: structuredClone(document.background),
    sectionOrder,
    sections,
    nodes,
  };
  return {
    scene,
    issues: issues.slice(0, 100),
    visibleAssetIds: [...assets].sort(),
    hasVisibleRsvp: Object.values(nodes).some((node) => node.type === 'RSVP'),
  };
}
