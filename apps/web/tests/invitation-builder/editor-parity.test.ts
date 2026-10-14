import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  type CanvasNode,
  scalePrimitiveDocument,
  resolveEditorDocument,
  validateEditorDocument,
} from '../../src/features/invitation-builder/document/editor-document';
import type {
  TemplateDesign,
  WeddingData,
} from '../../src/features/invitation-builder/document/types';

it('serializes the native 500px document and optional presentation fields consistently', () => {
  const fixtures = resolve(
    __dirname,
    '../../../../specs/004-invitation-builder/contracts/fixtures',
  );
  const source = JSON.parse(
    readFileSync(resolve(fixtures, 'all-elements.json'), 'utf8'),
  ) as TemplateDesign;
  const wedding = JSON.parse(
    readFileSync(resolve(fixtures, 'sample-a.json'), 'utf8'),
  ) as WeddingData;
  const document = scalePrimitiveDocument(source);
  document.settings.pageAnimation = 'fade-mix';
  for (const id of document.nodes.ROOT.nodes) {
    const content = (document.nodes[id] as CanvasNode).props.content;
    if ('textStyle' in content) content.textStyle.strike = true;
    if (document.nodes[id].type.resolvedName === 'Countdown')
      Object.assign(content, {
        layout: 'vertical',
        gap: 0,
        frameColor: '#112233FF',
      });
    if (document.nodes[id].type.resolvedName === 'Calendar')
      Object.assign(content, { variant: 'filled' });
  }
  expect(validateEditorDocument(document).valid).toBe(true);
  const results = (['preview', 'capture', 'public'] as const).map((mode) =>
    resolveEditorDocument(document, wedding, {
      mode,
      asOf: '2026-10-13T00:00:00Z',
    }),
  );
  for (const result of results) {
    expect(result.scene.canvas.width).toBe(500);
    expect(result.scene.schemaVersion).toBe(3);
    expect(result.scene.settings.pageAnimation).toBe('fade-mix');
    expect(result.scene.elements.length).toBeGreaterThan(0);
  }
  if (process.env.RESPONSIVE_PARITY_OUTPUT)
    writeFileSync(
      process.env.RESPONSIVE_PARITY_OUTPUT,
      JSON.stringify(results),
    );
});
