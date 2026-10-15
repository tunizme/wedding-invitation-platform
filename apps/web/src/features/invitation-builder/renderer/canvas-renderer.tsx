'use client';
import type { CSSProperties, ReactNode } from 'react';
import type {
  EditorScene,
  ResolvedAdvanced,
  NodeOptions,
} from '../document/editor-document';
import { ADVANCED_KINDS } from '../document/editor-document';
import type { RenderContext, ResolvedElement } from '../document/types';
import { frameStyle, backgroundStyle } from './primitives';
import { RenderElement } from './render-element';
import { AdvancedWidget } from './content-widgets';
import { InvitationPresentation } from './invitation-presentation';
import { cropShapeStyle } from './crop-shapes';
import styles from './canvas-renderer.module.css';

const LEGACY_MASKS: readonly NonNullable<NodeOptions['mask']>[] = [
  'none',
  'circle',
  'arch',
  'heart',
];

type PageAnimation = NonNullable<EditorScene['settings']['pageAnimation']>;
// Entrance applied to elements that do not set their own (FR-014 whole-page presets).
export function pageEntranceFor(
  animation: PageAnimation | undefined,
  index: number,
): NodeOptions['entrance'] {
  switch (animation) {
    case 'fade-all':
      return 'fade';
    case 'slide-all':
      return 'slide';
    case 'scale-all':
      return 'scale';
    case 'flip-all':
      return 'flip';
    case 'slide-mix':
      return index % 2 ? 'fade' : 'slide';
    case 'fade-mix':
      return index % 2 ? 'scale' : 'fade';
    default:
      return undefined;
  }
}
export function CanvasElement({
  element,
  context,
  options = {},
  locale = 'vi',
  pageEntrance,
  children,
}: {
  element: ResolvedElement | ResolvedAdvanced;
  context: RenderContext;
  options?: NodeOptions;
  locale?: 'vi' | 'en';
  pageEntrance?: NodeOptions['entrance'];
  children?: ReactNode;
}) {
  const image = element.type === 'Image' || element.type === 'Decoration';
  const effect =
    context.mode === 'public' || context.mode === 'preview'
      ? options.entranceEnabled === false
        ? 'none'
        : (options.entrance ?? pageEntrance)
      : 'none';
  const action = options.action;
  const activate = () => {
    if (context.mode !== 'public' || !action) return;
    if (action.kind === 'link' && action.value)
      window.location.assign(action.value);
    if (action.kind === 'scroll')
      document
        .querySelector(`[data-rendered-element="${action.value}"]`)
        ?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        });
    if (action.kind === 'gift')
      window.dispatchEvent(
        new CustomEvent('invitation-gift', {
          detail: { accounts: options.giftAccounts, title: options.giftTitle },
        }),
      );
  };
  const crop = image ? options.crop : undefined;
  return (
    <div
      data-rendered-element={element.id}
      style={frameStyle(element.box, element.appearance, context.assetUrls)}
      role={action ? 'button' : undefined}
      tabIndex={action ? 0 : undefined}
      aria-label={action ? 'Mở ' + element.type : undefined}
      onClick={action ? activate : undefined}
      onKeyDown={
        action
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate();
              }
            }
          : undefined
      }
    >
      <div
        data-entrance={effect}
        data-continuous={
          context.mode === 'public' || context.mode === 'preview'
            ? options.continuous
            : undefined
        }
        className={styles.content}
        style={
          {
            '--entrance-duration': `${options.entranceDuration ?? 0.8}s`,
            '--entrance-delay': `${options.entranceDelay ?? 0}s`,
            '--entrance-easing': options.entranceEasing ?? 'ease-out',
            '--continuous-duration': `${options.continuousDuration ?? 2}s`,
            '--continuous-delay': `${options.continuousDelay ?? 0}s`,
            height: '100%',
            overflow: image ? 'hidden' : undefined,
            borderRadius:
              options.mask === 'circle'
                ? '50%'
                : options.mask === 'arch'
                  ? '50% 50% 0 0'
                  : undefined,
            clipPath:
              options.mask === 'heart'
                ? 'polygon(50% 95%,0 35%,5% 10%,25% 0,50% 20%,75% 0,95% 10%,100% 35%)'
                : undefined,
            // Legacy masks keep their CSS geometry; newer shapes use SVG masks.
            ...(options.mask && !LEGACY_MASKS.includes(options.mask)
              ? cropShapeStyle(options.mask)
              : {}),
          } as CSSProperties
        }
      >
        <div style={{ width: '100%', height: '100%' }}>
          <div
            style={{
              width: crop ? `${100 / crop.width}%` : '100%',
              height: crop ? `${100 / crop.height}%` : '100%',
              transform: `${crop ? `translate(${-crop.x * 100}%,${-crop.y * 100}%) ` : ''}scale(${options.flipX ? -1 : 1},${options.flipY ? -1 : 1})`,
              transformOrigin: crop ? 'top left' : 'center',
            }}
          >
            {children ??
              ((ADVANCED_KINDS as readonly string[]).includes(element.type) ? (
                <AdvancedWidget
                  element={element as ResolvedAdvanced}
                  context={context}
                  locale={locale}
                />
              ) : (
                <RenderElement
                  element={element as ResolvedElement}
                  context={context}
                  contentOnly
                  locale={locale}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
export function CanvasRenderer({
  scene,
  context,
}: {
  scene: EditorScene;
  context: RenderContext;
}) {
  const gradient = scene.settings.gradient;
  return (
    <InvitationPresentation scene={scene} context={context}>
      <div
        data-invitation-root
        data-testid="editor-document-canvas"
        className={styles.canvas}
        style={{
          width: 500,
          height: scene.canvas.height,
          position: 'relative',
          overflow: 'hidden',
          ...backgroundStyle(scene.canvas.background, context.assetUrls),
          ...(gradient
            ? {
                backgroundImage: `linear-gradient(${gradient.angle}deg,${gradient.from},${gradient.to})`,
              }
            : {}),
        }}
      >
        {scene.elements.map((element, index) => (
          <CanvasElement
            key={element.id}
            element={element}
            options={scene.nodeOptions[element.id]}
            context={context}
            locale={scene.settings.locale}
            pageEntrance={pageEntranceFor(scene.settings.pageAnimation, index)}
          />
        ))}
      </div>
    </InvitationPresentation>
  );
}
