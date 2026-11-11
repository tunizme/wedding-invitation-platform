'use client';
import type { EditorScene } from '../invitation-builder/document/editor-document';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  RenderContext,
  SupportedResolvedScene,
} from '../invitation-builder/document/types';
import { InvitationRenderer } from '../invitation-builder/renderer/invitation-renderer';
import styles from './public-invitation-view.module.css';

function ScaledInvitationView({
  scene,
  context,
}: {
  scene: EditorScene;
  context: RenderContext;
}) {
  const outer = useRef<HTMLDivElement>(null),
    [scale, setScale] = useState(1),
    [previewHeight, setPreviewHeight] = useState<number>();
  const preview = context.mode === 'preview';
  useEffect(() => {
    const element = outer.current;
    if (!element) return;
    const measure = () => {
      const nextScale = Math.min(1, element.clientWidth / scene.canvas.width);
      setScale(nextScale);
      if (preview && nextScale > 0)
        setPreviewHeight(element.clientHeight / nextScale);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [scene.canvas.width, preview]);
  return (
    <div
      ref={outer}
      data-testid="public-workarea"
      className={preview ? styles.preview : undefined}
      style={{
        width: '100%',
        maxWidth: scene.canvas.width,
        height: preview ? undefined : scene.canvas.height * scale,
        margin: '0 auto',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={
          {
            width: scene.canvas.width,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            '--invitation-preview-height': previewHeight
              ? `${previewHeight}px`
              : undefined,
          } as CSSProperties
        }
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
  const [guestName, setGuestName] = useState<string>();
  const slug = context.mode === 'public' ? context.invitation?.slug : undefined;
  useEffect(() => {
    if (!slug) return;
    const token = new URLSearchParams(window.location.search).get('g'),
      base = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!token || !/^[a-f0-9-]{36}$/i.test(token) || !base) return;
    const controller = new AbortController();
    let live = true,
      sent = false;
    const endpoint = `${base.replace(/\/$/, '')}/public/invitations/${slug}/guests/${token}`;
    const record = () => {
      if (document.visibilityState !== 'visible' || sent || !live) return;
      sent = true;
      let eventId = crypto.randomUUID();
      try {
        const storageKey = `invitation-open:${slug}:${token}`,
          saved = sessionStorage.getItem(storageKey),
          prior = saved ? JSON.parse(saved) : null;
        if (
          prior &&
          typeof prior.eventId === 'string' &&
          Date.now() - prior.at < 30 * 60 * 1000
        )
          eventId = prior.eventId;
        else
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ eventId, at: Date.now() }),
          );
      } catch {
        /* Private browsing may disable session storage. */
      }
      void fetch(`${endpoint}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(10000),
      }).catch(() => {
        /* Statistics must not interrupt the invitation. */
      });
    };
    void fetch(endpoint, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const guest = (await response.json()) as { name?: unknown };
        if (live && typeof guest.name === 'string') {
          setGuestName(guest.name);
          record();
          document.addEventListener('visibilitychange', record);
        }
      })
      .catch(() => {
        /* Invalid or revoked guest links show the general invitation. */
      });
    return () => {
      live = false;
      controller.abort();
      document.removeEventListener('visibilitychange', record);
    };
  }, [slug]);
  return (
    <ScaledInvitationView scene={scene} context={{ ...context, guestName }} />
  );
}
