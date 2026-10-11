'use client';
import { useEffect, useRef, useState } from 'react';
import { InvitationRenderer } from './invitation-renderer';
import { captureVariants } from './capture-harness';
import {
  validateCaptureRequestV2,
  type CaptureRequestV2,
  type CaptureReportV2,
} from './capture-protocol-v2';
import { measureReadyScene, SceneReadinessError } from './measure';
import { backgroundStyle } from './primitives';
declare global {
  interface Window {
    invitationRendererV2?: {
      protocolVersion: 2;
      supportedScenePairs: [[1, 1], [2, 2]];
      render: (request: CaptureRequestV2) => Promise<CaptureReportV2>;
    };
  }
}
type Active = {
  request: CaptureRequestV2;
  resolve: (report: CaptureReportV2) => void;
  reject: (error: Error) => void;
  step: number;
  issues: CaptureReportV2['issues'];
  deadline: number;
};
export function ResponsiveCaptureHarness({
  visible,
  onStart,
  onEnd,
}: {
  visible: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef<Active | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  useEffect(() => {
    const api: NonNullable<Window['invitationRendererV2']> = {
      protocolVersion: 2,
      supportedScenePairs: [
        [1, 1],
        [2, 2],
      ],
      render(value) {
        let request: CaptureRequestV2;
        try {
          request = validateCaptureRequestV2(value);
          onStart();
        } catch (error) {
          return Promise.reject(error);
        }
        return new Promise((resolve, reject) => {
          const next = {
            request,
            resolve,
            reject,
            step: 0,
            issues: [],
            deadline: Date.now() + 25000,
          };
          pending.current = next;
          setActive(next);
        });
      },
    };
    window.invitationRendererV2 = api;
    return () => {
      if (window.invitationRendererV2 === api)
        delete window.invitationRendererV2;
      if (pending.current) {
        pending.current.reject(new Error('RENDER_CANCELLED'));
        pending.current = null;
        onEnd();
      }
    };
  }, [onStart, onEnd]);
  useEffect(() => {
    if (!active || !root.current || !visible) return;
    const abort = new AbortController();
    const request = active.request;
    const finish = (issues: CaptureReportV2['issues']) => {
      if (abort.signal.aborted) return;
      const element =
        root.current!.querySelector<HTMLElement>(
          request.scene.schemaVersion === 2
            ? '[data-invitation-root]'
            : '[data-testid="invitation-workarea"]',
        ) ?? root.current!.firstElementChild;
      const rect = element?.getBoundingClientRect();
      active.resolve({
        protocolVersion: 2,
        candidateHash: request.candidateHash,
        scenePair: request.scenePair,
        containerWidth: request.containerWidth,
        correlationId: request.correlationId,
        ready: issues.length === 0,
        issues: issues.slice(0, 100).map((issue) => ({
          ...issue,
          layout:
            issue.layout ??
            (request.containerWidth === 900 ? 'desktop' : 'mobile'),
        })),
        rootRect: {
          x: rect?.x ?? 0,
          y: rect?.y ?? 0,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        },
        captureRect: { x: 0, y: 0, width: request.containerWidth, height: 520 },
        hasVisibleRsvp: (request.scene.schemaVersion === 1
          ? request.scene.elements
          : Object.values(request.scene.nodes)
        ).some((node) => node.type === 'RSVP'),
      });
      pending.current = null;
      onEnd();
    };
    void measureReadyScene(root.current, request.scene, {
      signal: abort.signal,
      deadline: active.deadline,
    })
      .then((measured) => {
        if (abort.signal.aborted) return;
        const issues = [
          ...new Map(
            [...active.issues, ...measured].map((issue) => [
              JSON.stringify(issue),
              issue,
            ]),
          ).values(),
        ].slice(0, 100);
        if (active.step < captureVariants(request).length - 1)
          setActive({ ...active, step: active.step + 1, issues });
        else finish(issues);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          finish([
            {
              path: '/',
              code:
                error instanceof SceneReadinessError
                  ? error.code
                  : 'RENDER_ASSET_NOT_READY',
              layout: request.containerWidth === 900 ? 'desktop' : 'mobile',
            },
          ]);
      });
    return () => abort.abort();
  }, [active, visible, onEnd]);
  const width = active?.request.containerWidth ?? 390;
  return (
    <main
      hidden={!visible}
      aria-label="Bộ đo thiệp responsive"
      style={{ position: 'absolute', left: 0, top: 0, width, minHeight: 520 }}
    >
      <div
        ref={root}
        data-testid={visible ? 'capture-root' : undefined}
        style={{
          width,
          minHeight: 520,
          position: 'relative',
          ...(active
            ? backgroundStyle(
                active.request.scene.schemaVersion === 2
                  ? active.request.scene.background
                  : active.request.scene.canvas.background,
                active.request.context.assetUrls,
              )
            : {}),
        }}
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
