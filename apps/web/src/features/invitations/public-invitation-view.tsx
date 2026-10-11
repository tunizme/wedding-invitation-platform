'use client';
import styles from './public-responsive.module.css';
import { useEffect, useRef, useState } from 'react';
import type {
  RenderContext,
  ResolvedScene,
  SupportedResolvedScene,
} from '../invitation-builder/document/types';
import { InvitationRenderer } from '../invitation-builder/renderer/invitation-renderer';

function LegacyPublicInvitationView({
  scene,
  context,
}: {
  scene: ResolvedScene;
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
  hostPolicy = 'adaptive',
}: {
  scene: SupportedResolvedScene;
  context: RenderContext;
  hostPolicy?: 'adaptive' | 'mobile';
}) {
  if (scene.schemaVersion === 2)
    return (
      <div
        data-testid="public-workarea"
        className={context.mode === 'public' ? styles.surface : undefined}
        style={{ width: '100%', marginInline: 'auto' }}
      >
        <InvitationRenderer
          scene={scene}
          context={context}
          hostPolicy={hostPolicy}
        />
      </div>
    );
  return <LegacyPublicInvitationView scene={scene} context={context} />;
}
