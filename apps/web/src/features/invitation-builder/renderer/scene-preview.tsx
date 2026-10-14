'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  RenderContext,
  SupportedResolvedScene,
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
  scene: SupportedResolvedScene;
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
    let active = true,
      generation = 0;
    let controller: AbortController | undefined;
    const measure = () => {
      const current = ++generation;
      controller?.abort();
      controller = new AbortController();
      void measureReadyScene(element, scene, {
        signal: controller.signal,
        deadline: Date.now() + 10000,
      })
        .then((issues) => {
          if (active && generation === current) setMeasured(issues);
        })
        .catch((error: unknown) => {
          if (
            active &&
            generation === current &&
            !(error instanceof DOMException && error.name === 'AbortError')
          )
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
    };
    const observer = new ResizeObserver(measure);
    observer?.observe(element);
    element.addEventListener('load', measure, true);
    element.addEventListener('error', measure, true);
    document.fonts?.addEventListener?.('loadingdone', measure);
    measure();
    return () => {
      active = false;
      generation++;
      controller?.abort();
      observer?.disconnect();
      element.removeEventListener('load', measure, true);
      element.removeEventListener('error', measure, true);
      document.fonts?.removeEventListener?.('loadingdone', measure);
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
                {issue.sectionId ? `Section ${issue.sectionId}: ` : ''}
                {issue.layout ? `${issue.layout}: ` : ''}
                {issue.code} tại {issue.path}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
