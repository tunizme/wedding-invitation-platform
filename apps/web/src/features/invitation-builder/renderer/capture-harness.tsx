'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  RenderContext,
  ResolvedScene,
  SupportedResolvedScene,
} from '../document/types';
import { ResponsiveCaptureHarness } from './capture-harness-v2';
import { InvitationRenderer } from './invitation-renderer';
import { measureReadyScene, SceneReadinessError } from './measure';

type Request = {
  candidateHash: string;
  scene: ResolvedScene;
  context: RenderContext & { mode: 'capture' };
  states: 'publication-validation';
};
type Report = {
  version: 1;
  candidateHash: string;
  ready: boolean;
  issues: { nodeId?: string; path: string; code: string }[];
  captureRect: { x: number; y: number; width: number; height: number };
  hasVisibleRsvp: boolean;
};
declare global {
  interface Window {
    invitationRenderer?: {
      version: 1;
      render: (request: Request) => Promise<Report>;
    };
  }
}
type Active = {
  request: Request;
  resolve: (report: Report) => void;
  step: number;
  issues: Report['issues'];
};
export function captureVariants(request: {
  scene: SupportedResolvedScene;
  context: RenderContext;
}): RenderContext[] {
  const elements =
    request.scene.schemaVersion === 1
      ? request.scene.elements
      : Object.values(request.scene.nodes);
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

function LegacyCaptureHarness({
  visible,
  onStart,
  onEnd,
}: {
  visible: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active | null>(null);
  useEffect(() => {
    window.invitationRenderer = {
      version: 1,
      render: (request) => {
        if (
          request.scene.schemaVersion !== 1 ||
          request.scene.rendererContractVersion !== 1 ||
          request.context.mode !== 'capture' ||
          request.states !== 'publication-validation' ||
          !/^[a-f0-9]{64}$/.test(request.candidateHash)
        )
          return Promise.reject(new Error('RENDER_REQUEST_INVALID'));
        try {
          onStart();
        } catch (error) {
          return Promise.reject(error);
        }
        return new Promise((resolve) =>
          setActive({
            request,
            resolve: (report) => {
              onEnd();
              resolve(report);
            },
            step: 0,
            issues: [],
          }),
        );
      },
    };
    return () => {
      delete window.invitationRenderer;
    };
  }, [onStart, onEnd]);
  useEffect(() => {
    if (!active || !root.current) return;
    let cancelled = false;
    const request = active.request;
    void measureReadyScene(root.current, request.scene)
      .then((measured) => {
        if (cancelled) return;
        const issues = [
          ...new Map(
            [...active.issues, ...measured].map((issue) => [
              JSON.stringify(issue),
              issue,
            ]),
          ).values(),
        ];
        if (active.step < captureVariants(request).length - 1) {
          setActive({ ...active, step: active.step + 1, issues });
          return;
        }
        const captureRect = root.current!.getBoundingClientRect();
        active.resolve({
          version: 1,
          candidateHash: request.candidateHash,
          ready: issues.length === 0,
          issues,
          captureRect: {
            x: captureRect.left,
            y: captureRect.top,
            width: captureRect.width,
            height: Math.min(520, captureRect.height),
          },
          hasVisibleRsvp: request.scene.elements.some(
            (element) => element.type === 'RSVP',
          ),
        });
        // Retain the rendered scene until the next request so screenshot sees it.
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        active.resolve({
          version: 1,
          candidateHash: request.candidateHash,
          ready: false,
          issues: [
            {
              path: '/',
              code:
                error instanceof SceneReadinessError
                  ? error.code
                  : 'RENDER_ASSET_NOT_READY',
            },
          ],
          captureRect: { x: 0, y: 0, width: 390, height: 520 },
          hasVisibleRsvp: request.scene.elements.some(
            (element) => element.type === 'RSVP',
          ),
        });
        // Retain the rendered scene until the next request so screenshot sees it.
      });
    return () => {
      cancelled = true;
    };
  }, [active]);
  return (
    <main
      aria-label="Bộ đo thiệp"
      hidden={!visible}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 390,
        minHeight: 520,
      }}
    >
      <div
        ref={root}
        data-testid={visible ? 'capture-root' : undefined}
        style={{ width: 390, minHeight: 520, position: 'relative' }}
      >
        {active && (
          <InvitationRenderer
            scene={active.request.scene}
            context={captureVariants(active.request)[active.step]}
          />
        )}
      </div>
    </main>
  );
}

export function CaptureHarness() {
  const [surface, setSurface] = useState<1 | 2>(1);
  const busy = useRef(false);
  const [callbacks] = useState(() => ({
    legacyStart: () => {
      if (busy.current) throw new Error('RENDER_BUSY');
      busy.current = true;
      setSurface(1);
    },
    responsiveStart: () => {
      if (busy.current) throw new Error('RENDER_BUSY');
      busy.current = true;
      setSurface(2);
    },
    end: () => {
      busy.current = false;
    },
  }));
  return (
    <>
      <LegacyCaptureHarness
        visible={surface === 1}
        onStart={callbacks.legacyStart}
        onEnd={callbacks.end}
      />
      <ResponsiveCaptureHarness
        visible={surface === 2}
        onStart={callbacks.responsiveStart}
        onEnd={callbacks.end}
      />
    </>
  );
}
