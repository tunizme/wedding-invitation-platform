import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedScene } from '../../src/features/invitation-builder/document/types';
const measure = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/invitation-builder/renderer/measure', () => ({
  measureReadyScene: measure,
  SceneReadinessError: class extends Error {},
}));
import { ScenePreview } from '../../src/features/invitation-builder/renderer/scene-preview';
const scene: ResolvedScene = {
  schemaVersion: 1,
  rendererContractVersion: 1,
  canvas: {
    width: 390,
    height: 390,
    background: { kind: 'solid', color: '#FFFFFFFF' },
  },
  elements: [],
};
const context = {
  mode: 'preview' as const,
  asOf: '2026-01-01T00:00:00Z',
  assetUrls: {},
};
describe('preview diagnostics', () => {
  afterEach(cleanup);
  it('reports measured overflow alongside binding failures without changing scene', async () => {
    measure.mockResolvedValue([
      { nodeId: 'node', path: '/nodes/node/content', code: 'CONTENT_OVERFLOW' },
    ]);
    render(
      <ScenePreview
        scene={scene}
        context={context}
        bindingIssues={[{ path: '/nodes/missing', code: 'BINDING_REQUIRED' }]}
      />,
    );
    expect(await screen.findByText(/CONTENT_OVERFLOW/)).toBeInTheDocument();
    expect(screen.getByText(/BINDING_REQUIRED/)).toBeInTheDocument();
    expect(scene.canvas.height).toBe(390);
  });
});
