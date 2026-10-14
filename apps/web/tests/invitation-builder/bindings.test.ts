import { normalizeWedding } from '../../src/features/invitation-builder/document/validation-helpers';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePrimitiveDocument as resolveDesign } from '../../src/features/invitation-builder/document/resolve-design';
import { formFieldsForDesign } from '../../src/features/invitation-builder/document/binding-catalog';
import type {
  ElementNode,
  TemplateDesign,
  WeddingData,
} from '../../src/features/invitation-builder/document/types';

const fixtures = resolve(
  __dirname,
  '../../../../specs/004-invitation-builder/contracts/fixtures',
);
const read = <T>(file: string) =>
  JSON.parse(readFileSync(resolve(fixtures, file), 'utf8')) as T;
function designFixture(file: string) {
  return read<{ document: TemplateDesign; weddingData: WeddingData }>(
    `${file}.json`,
  );
}
const preview = { mode: 'preview' as const, asOf: '2026-01-01T00:00:00Z' };

describe('browser binding resolver corpus parity', () => {
  it('resolves fallback and keeps missing optional elements out of the scene', () => {
    const fallback = designFixture('binding-optional-fallback');
    const resolved = resolveDesign(
      fallback.document,
      fallback.weddingData,
      preview,
    );
    expect(resolved.issues).toEqual([]);
    expect(resolved.scene.elements[0].type).toBe('Text');
    if (resolved.scene.elements[0].type === 'Text')
      expect(resolved.scene.elements[0].content.text).toBe('Tên dự phòng');
    const missing = designFixture('binding-optional-missing');
    expect(
      resolveDesign(missing.document, missing.weddingData, preview).scene
        .elements,
    ).toHaveLength(0);
  });

  it('uses the timezone-selected event and never mutates the source design', () => {
    const { document } = designFixture('binding-optional-fallback');
    const id = document.nodes.ROOT.nodes[0];
    (document.nodes[id] as ElementNode).props.bindings[0] = {
      target: 'text',
      source: 'wedding.date',
      eventKey: 'ceremony',
    };
    const data = read<WeddingData>('sample-a.json'),
      before = structuredClone(document);
    const result = resolveDesign(document, data, preview);
    expect(result.issues).toEqual([]);
    if (result.scene.elements[0]?.type === 'Text')
      expect(result.scene.elements[0].content.text).toBe('10/01/2027');
    expect(document).toEqual(before);
  });

  it('returns only visible assets and detects malformed supplied values before fallback', () => {
    const { document } = designFixture('binding-wrong-type-fallback');
    const data = {
      schemaVersion: 1,
      bride: { name: 42 },
    } as unknown as WeddingData;
    const result = resolveDesign(document, data, preview);
    expect(result.issues.map(({ code }) => code)).toContain('BINDING_TYPE');
    expect(JSON.stringify(result.scene)).not.toContain('42');
    expect(result.visibleAssetIds).toEqual([]);
  });

  it('derives unique form fields for used, visible bindings and keeps bank message auxiliary', () => {
    const document = read<TemplateDesign>('all-elements.json');
    const textId = document.nodes.ROOT.nodes.find(
      (id) => document.nodes[id].type.resolvedName === 'Text',
    )!;
    (document.nodes[textId] as ElementNode).props.bindings = [
      { target: 'text', source: 'bride.name' },
    ];
    const fields = formFieldsForDesign(document);
    expect(fields.filter((field) => field.id === 'bride.name')).toHaveLength(1);
    expect(fields.find((field) => field.id === 'wedding.event')).toMatchObject({
      eventKey: 'ceremony',
      required: true,
    });
    expect(fields.find((field) => field.id === 'bank.message')).toMatchObject({
      auxiliary: true,
      required: false,
    });
  });
});

describe('partial event corpus', () => {
  const cases = JSON.parse(
    readFileSync(resolve(fixtures, 'event-resolution-cases.json'), 'utf8'),
  ) as { event: unknown; code: string }[];
  for (const [index, entry] of cases.entries()) {
    it(`handles event case ${index} with required, optional and whole-object fallback`, () => {
      const document = JSON.parse(
        readFileSync(resolve(fixtures, 'all-elements.json'), 'utf8'),
      ) as TemplateDesign;
      const id = document.nodes.ROOT.nodes.find(
        (key) => document.nodes[key].type.resolvedName === 'Calendar',
      )!;
      document.nodes.ROOT.nodes = [id];
      const node = document.nodes[
        id
      ] as import('../../src/features/invitation-builder/document/types').ElementNode;
      node.custom.optional = false;
      const data = {
        schemaVersion: 1,
        events: { ceremony: entry.event },
      } as WeddingData;
      const options = {
        mode: 'preview' as const,
        asOf: '2026-01-01T00:00:00Z',
      };
      expect(
        resolveDesign(document, data, options).issues.map(
          (issue) => issue.code,
        ),
      ).toEqual([entry.code]);
      node.custom.optional = true;
      expect(
        resolveDesign(document, data, options).issues.map(
          (issue) => issue.code,
        ),
      ).toEqual(entry.code === 'BINDING_TYPE' ? [entry.code] : []);
      const fallback = {
        datetime: '2028-06-01T10:00:00+07:00',
        timeZone: 'Asia/Ho_Chi_Minh',
      };
      node.props.bindings[0].fallback = fallback;
      const result = resolveDesign(document, data, options);
      if (entry.code === 'BINDING_TYPE')
        expect(result.issues.map((issue) => issue.code)).toEqual([entry.code]);
      else {
        expect(result.issues).toEqual([]);
        expect(result.scene.elements[0].content).toHaveProperty(
          'event',
          fallback,
        );
      }
    });
  }
});

describe('blank compound binding corpus', () => {
  const cases = JSON.parse(
    readFileSync(resolve(fixtures, 'blank-resolution-cases.json'), 'utf8'),
  ) as {
    kind: string;
    source: string;
    target: string;
    data: WeddingData;
    code: string;
    fallback: unknown;
  }[];
  for (const [index, entry] of cases.entries())
    it(`resolves raw/normalized blank compound case ${index} without losing invalid diagnostics`, () => {
      const document = JSON.parse(
        readFileSync(resolve(fixtures, 'all-elements.json'), 'utf8'),
      ) as TemplateDesign;
      const id = document.nodes.ROOT.nodes.find(
        (key) => document.nodes[key].type.resolvedName === entry.kind,
      )!;
      document.nodes.ROOT.nodes = [id];
      const node = document.nodes[
        id
      ] as import('../../src/features/invitation-builder/document/types').ElementNode;
      node.props.bindings = [
        {
          target: entry.target,
          source: entry.source,
          ...(entry.source === 'bank' ? {} : { eventKey: 'ceremony' }),
        },
      ] as typeof node.props.bindings;
      const options = {
        mode: 'preview' as const,
        asOf: '2026-01-01T00:00:00Z',
      };
      const before = structuredClone(entry.data);
      node.custom.optional = false;
      expect(
        resolveDesign(document, entry.data, options).issues.map(
          (issue) => issue.code,
        ),
      ).toEqual([entry.code]);
      node.custom.optional = true;
      const raw = resolveDesign(document, entry.data, options);
      expect(raw.issues.map((issue) => issue.code)).toEqual(
        entry.code === 'BINDING_TYPE' ? [entry.code] : [],
      );
      expect(raw.scene.elements).toHaveLength(0);
      expect(
        resolveDesign(
          document,
          normalizeWedding(entry.data) as WeddingData,
          options,
        ),
      ).toEqual(raw);
      node.props.bindings[0].fallback =
        entry.fallback as (typeof node.props.bindings)[0]['fallback'];
      const fallback = resolveDesign(document, entry.data, options);
      expect(fallback.issues.map((issue) => issue.code)).toEqual(
        entry.code === 'BINDING_TYPE' ? [entry.code] : [],
      );
      expect(fallback.scene.elements).toHaveLength(
        entry.code === 'BINDING_TYPE' ? 0 : 1,
      );
      expect(entry.data).toEqual(before);
    });
});

describe('Customer data order versus template layers (005 US4)', () => {
  it('follows timeline data order without reordering template layers or mutating the pinned design', () => {
    const document = read<TemplateDesign>('all-elements.json');
    const data = read<WeddingData>('sample-a.json');
    const entries = data.timeline ?? [];
    expect(entries.length).toBeGreaterThan(1);
    const before = structuredClone(document);
    const layers = (
      scene: import('../../src/features/invitation-builder/document/types').ResolvedScene,
    ) => scene.elements.map((element) => element.id);
    const timeline = (
      scene: import('../../src/features/invitation-builder/document/types').ResolvedScene,
    ) => scene.elements.find((element) => element.type === 'Timeline');

    const forward = resolveDesign(document, data, preview);
    const reversed = resolveDesign(
      document,
      { ...data, timeline: [...entries].reverse() },
      preview,
    );
    // Layers keep the authored z-order whatever the Customer's data order is.
    expect(layers(reversed.scene)).toEqual(layers(forward.scene));
    expect(layers(forward.scene)).toEqual(
      document.nodes.ROOT.nodes.filter((id) =>
        forward.scene.elements.some((e) => e.id === id),
      ),
    );
    // The widget itself shows entries in the order the Customer supplied them.
    const titles = (
      scene: import('../../src/features/invitation-builder/document/types').ResolvedScene,
    ) => {
      const widget = timeline(scene);
      return widget?.type === 'Timeline'
        ? (widget.content.entries ?? []).map(
            (entry: { title: string }) => entry.title,
          )
        : [];
    };
    expect(titles(forward.scene)).toEqual(entries.map((entry) => entry.title));
    expect(titles(reversed.scene)).toEqual(
      [...entries].reverse().map((entry) => entry.title),
    );
    expect(document).toEqual(before);
  });
});
