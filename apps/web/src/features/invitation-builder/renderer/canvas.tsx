import type { ReactNode } from 'react';
import type { Canvas } from '../document/types';
import { BackgroundAssetStatus } from './asset-image';
import { backgroundStyle } from './primitives';

export function InvitationCanvasDisplay({
  canvas,
  assets,
  children,
  testId = 'workarea',
}: {
  canvas: Canvas;
  assets: Record<string, string>;
  children?: ReactNode;
  testId?: string | null;
}) {
  return (
    <div
      data-testid={testId ?? undefined}
      style={{
        position: 'relative',
        width: canvas.width,
        height: canvas.height,
        overflow: 'hidden',
        ...backgroundStyle(canvas.background, assets),
      }}
    >
      {canvas.background.kind === 'asset' && (
        <BackgroundAssetStatus source={assets[canvas.background.assetId]} />
      )}
      {children}
    </div>
  );
}
