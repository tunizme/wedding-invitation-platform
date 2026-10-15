import { openingAssetIds } from '../../invitation-builder/domain/effects';
import type { SupportedResolvedScene } from '../../invitation-builder/domain/document.types';

/** Public byte delivery is limited to assets present in the committed scene. */
export function visibleSceneAssetIds(scene: SupportedResolvedScene): string[] {
  if (scene.schemaVersion !== 3 || scene.rendererContractVersion !== 3)
    return [];
  const ids = new Set<string>(openingAssetIds(scene.settings.openingEffect));
  if (scene.schemaVersion === 3) {
    if (scene.settings.audio.assetId) ids.add(scene.settings.audio.assetId);
    if (scene.settings.shareImageId) ids.add(scene.settings.shareImageId);
    for (const e of scene.elements) {
      if ('assetIds' in e.content)
        for (const a of e.content.assetIds ?? []) ids.add(a);
      if ('posterId' in e.content && e.content.posterId)
        ids.add(e.content.posterId);
    }
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
