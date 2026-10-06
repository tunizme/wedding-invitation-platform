'use client';
import { useEffect, useRef, useState } from 'react';
import type { RenderContext, ResolvedScene } from '../invitation-builder/document/types';
import { InvitationRenderer } from '../invitation-builder/renderer/invitation-renderer';

export function PublicInvitationView({ scene, context }: { scene: ResolvedScene; context: RenderContext }) {
  const outer = useRef<HTMLDivElement>(null), [scale, setScale] = useState(1);
  useEffect(() => {
    const element = outer.current;
    if (!element) return;
    const measure = () => setScale(Math.min(1, element.clientWidth / scene.canvas.width));
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, [scene.canvas.width]);
  return <div ref={outer} data-testid="public-workarea" style={{ width: '100%', maxWidth: scene.canvas.width,
    height: scene.canvas.height * scale, margin: '0 auto', position: 'relative', overflow: 'hidden' }}>
    <div style={{ width: scene.canvas.width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
      <InvitationRenderer scene={scene} context={context} />
    </div>
  </div>;
}
