'use client';
import { useRef, useState } from 'react';
import type { SupportedResolvedScene, RenderContext } from '../document/types';
import { CanvasCaptureHarness } from './canvas-capture';
export function captureVariants(request: {
  scene: SupportedResolvedScene;
  context: RenderContext;
}): RenderContext[] {
  const elements = request.scene.elements;
  const contexts: RenderContext[] = [];
  if (elements.some((element) => element.type === 'RSVP')) {
    for (const rsvp of [
      'open',
      'error',
      'validation-error',
      'submitting',
      'success',
      'closed',
    ] as const)
      contexts.push({ ...request.context, validationState: { rsvp } });
    // Polling can lose connectivity while validation/request feedback remains visible.
    // Use the same live markup and messages; every reachable combination must fit.
    for (const rsvp of ['open', 'validation-error', 'error'] as const)
      contexts.push({
        ...request.context,
        validationState: { rsvp, rsvpUnavailable: true },
      });
    for (const rsvpUnavailable of [false, true])
      contexts.push({
        ...request.context,
        validationState: {
          rsvp: 'error',
          rsvpRateLimited: true,
          rsvpUnavailable,
        },
      });
  }
  if (elements.some((element) => element.type === 'Countdown')) {
    for (const countdown of ['worst-case', 'expired'] as const)
      contexts.push({ ...request.context, validationState: { countdown } });
  }
  // Last pass restores the normal frozen scene before resolving for screenshot.
  return [...contexts, { ...request.context, validationState: undefined }];
}

export function CaptureHarness() {
  const busy = useRef(false);
  const [callbacks] = useState(() => ({
    start: () => {
      if (busy.current) throw new Error('RENDER_BUSY');
      busy.current = true;
    },
    end: () => {
      busy.current = false;
    },
  }));
  return (
    <CanvasCaptureHarness
      visible
      onStart={callbacks.start}
      onEnd={callbacks.end}
    />
  );
}
