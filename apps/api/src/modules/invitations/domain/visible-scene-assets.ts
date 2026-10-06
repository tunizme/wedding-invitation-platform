import type { ResolvedScene } from '../../invitation-builder/domain/document.types';

/** Public byte delivery is limited to assets present in the committed scene. */
export function visibleSceneAssetIds(scene: ResolvedScene): string[] {
  const ids = new Set<string>();
  if (scene.canvas.background.kind === 'asset') ids.add(scene.canvas.background.assetId);
  for (const element of scene.elements) {
    if (element.appearance.background?.kind === 'asset') ids.add(element.appearance.background.assetId);
    if ((element.type === 'Image' || element.type === 'Decoration') &&
        'assetId' in element.content && typeof element.content.assetId === 'string')
      ids.add(element.content.assetId);
  }
  return [...ids].sort();
}
