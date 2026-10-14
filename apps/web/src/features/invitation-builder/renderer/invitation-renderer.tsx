import { CanvasRenderer } from './canvas-renderer';
import './fonts.css';
import type { SupportedResolvedScene, RenderContext } from '../document/types';
export { RenderElement } from './render-element';
export function InvitationRenderer({
  scene,
  context,
}: {
  scene: SupportedResolvedScene;
  context: RenderContext;
  hostPolicy?: 'adaptive' | 'mobile';
}) {
  if (scene.schemaVersion !== 3 || scene.rendererContractVersion !== 3)
    throw new Error('UNSUPPORTED_SCHEMA');
  return <CanvasRenderer scene={scene} context={context} />;
}
