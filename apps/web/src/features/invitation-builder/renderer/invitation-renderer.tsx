import './fonts.css';
import type { SupportedResolvedScene, RenderContext } from '../document/types';
import { InvitationRendererV1 } from './v1/invitation-renderer-v1';
import { InvitationRendererV2 } from './v2/invitation-renderer-v2';
import { InvitationViewport } from './invitation-viewport';
export { RenderElement } from './v1/invitation-renderer-v1';
export function InvitationRenderer({
  scene,
  context,
  hostPolicy = 'adaptive',
}: {
  scene: SupportedResolvedScene;
  context: RenderContext;
  hostPolicy?: 'adaptive' | 'mobile';
}) {
  if (scene.schemaVersion === 1 && scene.rendererContractVersion === 1)
    return <InvitationRendererV1 scene={scene} context={context} />;
  if (scene.schemaVersion === 2 && scene.rendererContractVersion === 2)
    return (
      <InvitationViewport policy={hostPolicy}>
        <InvitationRendererV2 scene={scene} context={context} />
      </InvitationViewport>
    );
  throw new Error('UNSUPPORTED_SCHEMA');
}
