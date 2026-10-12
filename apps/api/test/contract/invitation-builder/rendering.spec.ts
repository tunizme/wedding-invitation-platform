import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalHash } from '../../../src/modules/invitation-builder/domain/validation-helpers';
import { resolveDesign } from '../../../src/modules/invitation-builder/domain/resolve-design';
import type {
  TemplateDesign,
  WeddingData,
} from '../../../src/modules/invitation-builder/domain/document.types';

const fixtures = resolve(
  __dirname,
  '../../../../../specs/004-invitation-builder/contracts/fixtures',
);
const read = <T>(file: string) =>
  JSON.parse(readFileSync(resolve(fixtures, file), 'utf8')) as T;

describe('resolved scene publication contract', () => {
  it('projects visible nodes, used assets and RSVP without private data or editor metadata', () => {
    const document = read<TemplateDesign>('all-elements.json');
    const data = read<WeddingData>('sample-a.json');
    const result = resolveDesign(document, data, {
      mode: 'public',
      asOf: '2026-01-01T00:00:00Z',
      invitation: {
        slug: '00000000-0000-4000-8000-000000000010',
        publicVersion: 1,
        rsvpOpen: true,
      },
    });
    expect(result.issues).toEqual([]);
    expect(result.hasVisibleRsvp).toBe(true);
    expect(result.scene.elements).toHaveLength(
      document.nodes.ROOT.nodes.length,
    );
    const serialized = JSON.stringify(result.scene);
    expect(serialized).not.toContain('bindings');
    expect(serialized).not.toContain('custom');
    expect(serialized).not.toContain(data.story);
    expect(result.visibleAssetIds).toContain(data.bride?.photo);
  });

  it('returns deterministic candidate hashes and reports missing required data without mutating source', () => {
    const fixture = read<{
      document: TemplateDesign;
      weddingData: WeddingData;
    }>('binding-required-missing.json');
    const before = structuredClone(fixture.document);
    const result = resolveDesign(fixture.document, fixture.weddingData, {
      mode: 'capture',
      asOf: '2026-01-01T00:00:00Z',
    });
    expect(result.issues.map(({ code }) => code)).toContain('BINDING_REQUIRED');
    expect(fixture.document).toEqual(before);
    expect(canonicalHash(fixture.document)).toBe(canonicalHash(before));
  });
});
