'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  RenderContext,
  ResolvedScene,
  ValidationIssue,
} from '../document/types';
import { InvitationRenderer } from './invitation-renderer';
import {
  measureReadyScene,
  SceneReadinessError,
  type MeasureIssue,
} from './measure';

/** UI diagnostics use the same canonical measurement as trusted publication. */
export function ScenePreview({
  scene,
  context,
  bindingIssues = [],
  children,
}: {
  scene: ResolvedScene;
  context: RenderContext;
  bindingIssues?: ValidationIssue[];
  children?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    [measured, setMeasured] = useState<MeasureIssue[]>([]);
  const assetKey = JSON.stringify(context.assetUrls);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let active = true;
    void measureReadyScene(element, scene)
      .then((issues) => {
        if (active) setMeasured(issues);
      })
      .catch((error: unknown) => {
        if (active)
          setMeasured([
            {
              path: '/',
              code:
                error instanceof SceneReadinessError
                  ? error.code
                  : 'RENDER_ASSET_NOT_READY',
            },
          ]);
      });
    return () => {
      active = false;
    };
  }, [scene, assetKey]);
  const issues = [...bindingIssues, ...measured];
  return (
    <section aria-label="Kiểm tra bản xem trước">
      <div ref={root}>
        {children ?? <InvitationRenderer scene={scene} context={context} />}
      </div>
      {issues.length > 0 && (
        <div role="alert">
          <p>Bản xem trước cần kiểm tra:</p>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.path}:${issue.code}:${index}`}>
                {issue.nodeId ? `Phần tử ${issue.nodeId}: ` : ''}
                {issue.code} tại {issue.path}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
