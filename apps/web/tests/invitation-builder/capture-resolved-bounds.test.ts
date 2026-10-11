import { it, expect } from 'vitest';
import pilot from '../../../../specs/007-responsive-invitation-layout/contracts/fixtures/pilot-v2.json';
import { newLeaf } from '../../src/features/invitation-builder/editor/section-commands';
import { importSectionDesign } from '../../src/features/invitation-builder/editor/section-adapter';
import { resolveDesign } from '../../src/features/invitation-builder/document/resolve-design';
import { validateCaptureRequestV2 } from '../../src/features/invitation-builder/renderer/capture-protocol-v2';
import { validateWeddingData } from '../../src/features/invitations/wedding-data.schema';
it('validates repeated resolved widget data above authored byte limit without weakening content/shape bounds', () => {
  const document = importSectionDesign(pilot);
  document.nodes = {};
  document.sectionOrder = document.sectionOrder.slice(0, 1);
  document.sections = Object.fromEntries(
    document.sectionOrder.map((id) => [
      id,
      { ...document.sections[id], flowNodeIds: [], artworkNodeIds: [] },
    ]),
  );
  for (let index = 0; index < 30; index++) {
    const node = newLeaf('Timeline');
    node.bindings = [{ target: 'entries', source: 'timeline' }];
    document.nodes[node.id] = node;
    document.sections[document.sectionOrder[0]].flowNodeIds.push(node.id);
  }
  const data = {
    schemaVersion: 1 as const,
    timeline: Array.from({ length: 20 }, () => ({
      id: crypto.randomUUID(),
      title: 'Lễ thành hôn',
      description: '🌸'.repeat(500),
    })),
  };
  expect(validateWeddingData(data).valid).toBe(true);
  const context = {
    mode: 'capture' as const,
    asOf: '2026-10-11T00:00:00.000Z',
    assetUrls: {},
  };
  const scene = resolveDesign(
    importSectionDesign(document),
    data,
    context,
  ).scene;
  expect(
    new TextEncoder().encode(JSON.stringify(scene)).byteLength,
  ).toBeGreaterThan(1048576);
  const request = {
    protocolVersion: 2,
    candidateHash: 'a'.repeat(64),
    correlationId: crypto.randomUUID(),
    scene,
    context,
    states: 'publication-validation',
    containerWidth: 390,
    scenePair: [2, 2],
  };
  expect(() => validateCaptureRequestV2(request)).not.toThrow();
  expect(() =>
    validateCaptureRequestV2({
      ...request,
      scene: { ...scene, unknown: true },
    }),
  ).toThrow('RENDER_REQUEST_INVALID');
});
