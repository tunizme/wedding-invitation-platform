import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { validateSupportedTemplateDesign } from '../../src/features/invitation-builder/document/schema';
const directory = resolve(
  import.meta.dirname,
  '../../../../specs/007-responsive-invitation-layout/contracts/fixtures',
);
const load = (name: string) =>
  JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
describe('responsive document corpus', () => {
  it('accepts the valid section pilot', () => {
    const r = validateSupportedTemplateDesign(load('valid-v2.json'));
    expect(r.valid, JSON.stringify(r)).toBe(true);
  });
  for (const entry of load('invalid-v2.json') as {
    id: string;
    document: unknown;
  }[])
    it(entry.id, () =>
      expect(validateSupportedTemplateDesign(entry.document).valid).toBe(false),
    );
  it('bounds JSON and rejects nonfinite values', () => {
    const d = load('valid-v2.json');
    d.nodes[Object.keys(d.nodes)[0]].content.text = 'a'.repeat(1048576);
    expect(validateSupportedTemplateDesign(d).valid).toBe(false);
    d.nodes[Object.keys(d.nodes)[0]].content.text = 'a';
    d.sections[d.sectionOrder[0]].mobile.gap = Infinity;
    expect(validateSupportedTemplateDesign(d).valid).toBe(false);
  });
  it('retains legacy validator contract', () => {
    // The legacy directory is resolved from the repository, not the feature fixture nesting.
    const legacy = resolve(
      directory,
      '../../../004-invitation-builder/contracts/fixtures',
    );
    const manifest = JSON.parse(
      readFileSync(resolve(legacy, 'manifest.json'), 'utf8'),
    );
    for (const c of manifest.cases.filter(
      (c: { kind: string }) => c.kind === 'design',
    ))
      expect(
        validateSupportedTemplateDesign(
          JSON.parse(readFileSync(resolve(legacy, c.file), 'utf8')),
        ).valid,
        c.id,
      ).toBe(c.expected.valid);
  });
});
