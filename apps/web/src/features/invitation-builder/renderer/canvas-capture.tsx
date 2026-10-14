'use client';
import { useEffect, useRef, useState } from 'react';
import type { EditorScene } from '../document/editor-document';
import type { RenderContext } from '../document/types';
import { PublicInvitationView } from '../../invitations/public-invitation-view';
import { measureReadyScene, SceneReadinessError } from './measure';
import { captureVariants } from './capture-harness';

type Request = {
  candidateHash: string;
  scene: EditorScene;
  context: RenderContext;
  containerWidth: 390 | 500;
  states: 'publication-validation';
};
type Report = {
  version: 3;
  candidateHash: string;
  ready: boolean;
  issues: import('../document/types').ValidationIssue[];
  captureRect: { x: number; y: number; width: number; height: number };
  hasVisibleRsvp: boolean;
};
declare global {
  interface Window {
    invitationCanvasRenderer?: {
      version: 3;
      render: (request: Request) => Promise<Report>;
    };
  }
}
export function CanvasCaptureHarness({
  visible,
  onStart,
  onEnd,
}: {
  visible: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    [active, setActive] = useState<{
      request: Request;
      resolve: (report: Report) => void;
      step: number;
      issues: Report['issues'];
    } | null>(null);
  useEffect(() => {
    window.invitationCanvasRenderer = {
      version: 3,
      render: (request) => {
        if (
          request.scene.schemaVersion !== 3 ||
          request.scene.rendererContractVersion !== 3 ||
          request.context.mode !== 'capture' ||
          request.states !== 'publication-validation' ||
          ![390, 500].includes(request.containerWidth) ||
          !/^[a-f0-9]{64}$/.test(request.candidateHash)
        )
          return Promise.reject(new Error('RENDER_REQUEST_INVALID'));
        onStart();
        return new Promise((resolve) =>
          setActive({
            request,
            step: 0,
            issues: [],
            resolve: (report) => {
              onEnd();
              resolve(report);
            },
          }),
        );
      },
    };
    return () => {
      delete window.invitationCanvasRenderer;
    };
  }, [onStart, onEnd]);
  useEffect(() => {
    if (!active || !root.current) return;
    let disposed = false;
    const request = active.request;
    void measureReadyScene(root.current, request.scene)
      .then((measured) => {
        if (disposed) return;
        const issues = [
          ...new Map(
            [...active.issues, ...measured].map((i) => [JSON.stringify(i), i]),
          ).values(),
        ];
        if (active.step < captureVariants(request).length - 1) {
          setActive({ ...active, step: active.step + 1, issues });
          return;
        }
        const r = root.current!.getBoundingClientRect();
        active.resolve({
          version: 3,
          candidateHash: request.candidateHash,
          ready: !issues.length,
          issues,
          captureRect: { x: r.x, y: r.y, width: r.width, height: 520 },
          hasVisibleRsvp: request.scene.elements.some((e) => e.type === 'RSVP'),
        });
      })
      .catch((cause: unknown) => {
        if (!disposed)
          active.resolve({
            version: 3,
            candidateHash: request.candidateHash,
            ready: false,
            issues: [
              {
                path: '/',
                code:
                  cause instanceof SceneReadinessError
                    ? cause.code
                    : 'RENDER_ASSET_NOT_READY',
              },
            ],
            captureRect: {
              x: 0,
              y: 0,
              width: request.containerWidth,
              height: 520,
            },
            hasVisibleRsvp: request.scene.elements.some(
              (e) => e.type === 'RSVP',
            ),
          });
      });
    return () => {
      disposed = true;
    };
  }, [active]);
  return (
    <main
      hidden={!visible}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: active?.request.containerWidth ?? 500,
        minHeight: 520,
      }}
    >
      <div
        ref={root}
        data-testid={visible ? 'capture-root' : undefined}
        style={{ width: active?.request.containerWidth ?? 500, minHeight: 520 }}
      >
        {active && (
          <PublicInvitationView
            scene={active.request.scene}
            context={captureVariants(active.request)[active.step]}
          />
        )}
      </div>
    </main>
  );
}
