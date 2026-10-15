'use client';
import { useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { EditorSettings } from '../document/editor-document';
import styles from './falling-effects.module.css';
export const FALLING_TYPES = [
  ['snow', 'Tuyết', '❅'],
  ['hearts', 'Trái tim', '❤️'],
  ['flowers', 'Hoa', '🌸'],
  ['stars', 'Sao', '⭐'],
  ['confetti', 'Confetti', '🎉'],
  ['butterflies', 'Bướm', '🦋'],
  ['mix', 'Mix', '❤️❅🤍'],
] as const;
const fallDelays = [1, 6, 4, 2, 8, 6, 2.5, 1, 0, 3, 2, 4];
const swayDelays = [1, 0.5, 2, 2, 3, 2, 1, 0, 1.5, 0, 0, 2.5];
const subscribeMounted = () => () => {};
export function FallingEffects({
  kind,
  paused = false,
  viewport = false,
}: {
  kind: EditorSettings['particles'];
  paused?: boolean;
  viewport?: boolean;
}) {
  const mounted = useSyncExternalStore(
    subscribeMounted,
    () => true,
    () => false,
  );
  if (kind === 'none' || (viewport && !mounted)) return null;
  const glyph = FALLING_TYPES.find((t) => t[0] === kind)?.[2] ?? '🌸';
  const layer = (
    <div
      className={styles.layer}
      aria-hidden="true"
      data-falling-effect={kind}
      data-paused={paused}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className={styles.flake}
          style={
            {
              left: `${i === 0 ? 1 : i * 8.3}%`,
              animationDelay: `${swayDelays[i]}s`,
            } as CSSProperties
          }
        >
          <span style={{ animationDelay: `${fallDelays[i]}s` }}>
            {kind === 'mix' ? ['❅', '❤️', '🤍'][i % 3] : glyph}
          </span>
        </span>
      ))}
    </div>
  );
  return viewport ? createPortal(layer, document.body) : layer;
}
