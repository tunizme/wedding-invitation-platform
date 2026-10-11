import type { ResolvedSceneV2, RenderContext } from '../../document/types';
import { backgroundStyle } from '../primitives';
import { BackgroundAssetStatus } from '../asset-image';
import { SectionRenderer } from './section-renderer';
import styles from './responsive.module.css';
export function InvitationRendererV2({
  scene,
  context,
}: {
  scene: ResolvedSceneV2;
  context: RenderContext;
}) {
  return (
    <article
      data-invitation-root
      data-scene-version="2"
      className={styles.invitation}
      style={backgroundStyle(scene.background, context.assetUrls)}
    >
      {scene.background.kind === 'asset' && (
        <BackgroundAssetStatus
          source={context.assetUrls[scene.background.assetId]}
        />
      )}
      {scene.sectionOrder.map((id) => (
        <SectionRenderer
          key={id}
          section={scene.sections[id]}
          nodes={scene.nodes}
          context={context}
        />
      ))}
    </article>
  );
}
