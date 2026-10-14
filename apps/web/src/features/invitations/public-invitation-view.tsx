'use client';
import type { EditorScene } from '../invitation-builder/document/editor-document';
import { useEffect, useRef, useState } from 'react';
import type {
  RenderContext,
  SupportedResolvedScene,
} from '../invitation-builder/document/types';
import { InvitationRenderer } from '../invitation-builder/renderer/invitation-renderer';

function ScaledInvitationView({
  scene,
  context,
}: {
  scene: EditorScene;
  context: RenderContext;
}) {
  const outer = useRef<HTMLDivElement>(null),
    [scale, setScale] = useState(1);
  useEffect(() => {
    const element = outer.current;
    if (!element) return;
    const measure = () =>
      setScale(Math.min(1, element.clientWidth / scene.canvas.width));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [scene.canvas.width]);
  return (
    <div
      ref={outer}
      data-testid="public-workarea"
      style={{
        width: '100%',
        maxWidth: scene.canvas.width,
        height: scene.canvas.height * scale,
        margin: '0 auto',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: scene.canvas.width,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <InvitationRenderer scene={scene} context={context} />
      </div>
    </div>
  );
}

export function PublicInvitationView({
  scene,
  context,
}: {
  scene: SupportedResolvedScene;
  context: RenderContext;
  hostPolicy?: 'adaptive' | 'mobile';
}) {
  return <ScaledInvitationView scene={scene} context={context} />;
}
