import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorScene } from '../../src/features/invitation-builder/document/editor-document';
import { defaultEditorSettings } from '../../src/features/invitation-builder/document/editor-document';
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    disconnect() {}
  },
);
const measure = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/invitation-builder/renderer/measure', () => ({
  measureReadyScene: measure,
  SceneReadinessError: class extends Error {},
}));
import { ScenePreview } from '../../src/features/invitation-builder/renderer/scene-preview';
const scene: EditorScene = {
  schemaVersion: 3,
  rendererContractVersion: 3,
  canvas: {
    width: 500,
    height: 390,
    background: { kind: 'solid', color: '#FFFFFFFF' },
  },
  elements: [],
  nodeOptions: {},
  settings: defaultEditorSettings(),
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
