import type { SupportedResolvedScene } from '../../invitation-builder/domain/document.types';

/** Public byte delivery is limited to assets present in the committed scene. */
export function visibleSceneAssetIds(scene: SupportedResolvedScene): string[] {
  const ids = new Set<string>();
  if (scene.schemaVersion === 2) {
    const background = (bg: typeof scene.background) => {
      if (bg.kind === 'asset') ids.add(bg.assetId);
    };
    background(scene.background);
    for (const id of scene.sectionOrder) {
      const section = scene.sections[id];
      background(section.background);
      for (const nid of [...section.flowNodeIds, ...section.artworkNodeIds]) {
        const node = scene.nodes[nid];
        if (node.appearance.background) background(node.appearance.background);
        if (
          'assetId' in node.content &&
          typeof node.content.assetId === 'string'
        )
          ids.add(node.content.assetId);
      }
    }
    return [...ids].sort();
  }
  if (scene.canvas.background.kind === 'asset')
    ids.add(scene.canvas.background.assetId);
  for (const element of scene.elements) {
    if (element.appearance.background?.kind === 'asset')
      ids.add(element.appearance.background.assetId);
    if (
      (element.type === 'Image' || element.type === 'Decoration') &&
      'assetId' in element.content &&
      typeof element.content.assetId === 'string'
    )
      ids.add(element.content.assetId);
  }
  return [...ids].sort();
}
