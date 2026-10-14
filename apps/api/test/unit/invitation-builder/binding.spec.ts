import { normalizeWedding } from '../../../src/modules/invitation-builder/domain/validation-helpers';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePrimitiveDocument as resolveDesign } from '../../../src/modules/invitation-builder/domain/resolve-design';
import type {
  TemplateDesign,
  WeddingData,
} from '../../../src/modules/invitation-builder/domain/document.types';
import { formFieldsForDesign } from '../../../src/modules/invitation-builder/domain/binding-catalog';

const root = resolve(
  __dirname,
  '../../../../../specs/004-invitation-builder/contracts/fixtures',
);
function fixture(name: string) {
  return JSON.parse(readFileSync(resolve(root, `${name}.json`), 'utf8')) as {
    document: TemplateDesign;
    weddingData: WeddingData;
  };
}

describe('binding resolution and public projection corpus', () => {
  it('uses an explicit whole-value fallback for absent data and does not mutate design', () => {
    const { document, weddingData } = fixture('binding-optional-fallback');
    const original = structuredClone(document);
    const result = resolveDesign(document, weddingData, {
      mode: 'preview',
      asOf: '2026-01-01T00:00:00Z',
    });
    expect(result.issues).toEqual([]);
    expect(result.scene.elements[0].type).toBe('Text');
    if (result.scene.elements[0].type === 'Text')
      expect(result.scene.elements[0].content.text).toBe('Tên dự phòng');
    expect(document).toEqual(original);
  });

  it('hides a missing optional element without changing scene geometry', () => {
    const { document, weddingData } = fixture('binding-optional-missing');
    const originalBox = (
      document.nodes[
        document.nodes.ROOT.nodes[0]
      ] as import('../../../src/modules/invitation-builder/domain/document.types').ElementNode
    ).props.box;
    const result = resolveDesign(document, weddingData, {
      mode: 'preview',
      asOf: '2026-01-01T00:00:00Z',
    });
    expect(result.scene.elements).toHaveLength(0);
    expect(
      (
        document.nodes[
          document.nodes.ROOT.nodes[0]
        ] as import('../../../src/modules/invitation-builder/domain/document.types').ElementNode
      ).props.box,
    ).toEqual(originalBox);
  });

  it('uses complete fallback rather than merging a partial object', () => {
    const document = JSON.parse(
      readFileSync(resolve(root, 'all-elements.json'), 'utf8'),
    ) as TemplateDesign;
    const weddingData = JSON.parse(
      readFileSync(resolve(root, 'data-partial-bank.json'), 'utf8'),
    ) as WeddingData;
    const id = Object.keys(document.nodes).find(
      (key) =>
        key !== 'ROOT' && document.nodes[key].type.resolvedName === 'QRBank',
    )!;
    document.nodes.ROOT.nodes = [id];
    (
      document.nodes[
        id
      ] as import('../../../src/modules/invitation-builder/domain/document.types').ElementNode
    ).props.bindings[0].fallback = {
      bin: '970436',
      account: '000123456789',
      recipientName: 'NGUYEN MINH ANH',
      message: 'Mung cuoi',
    };
    const result = resolveDesign(document, weddingData, {
      mode: 'preview',
      asOf: '2026-01-01T00:00:00Z',
    });
    expect(result.issues).toEqual([]);
    expect(result.scene.elements[0].type).toBe('QRBank');
    if (result.scene.elements[0].type === 'QRBank')
      expect(result.scene.elements[0].content.bank).toEqual({
        bin: '970436',
        account: '000123456789',
        recipientName: 'NGUYEN MINH ANH',
        message: 'Mung cuoi',
      });
  });

  it('keeps wrong types invalid even when a fallback exists', () => {
    const { document, weddingData } = fixture('binding-wrong-type-fallback');
    const result = resolveDesign(document, weddingData, {
      mode: 'preview',
      asOf: '2026-01-01T00:00:00Z',
    });
    expect(result.issues.map(({ code }) => code)).toContain('BINDING_TYPE');
    expect(JSON.stringify(result.issues)).not.toContain('42');
  });

  it('reports missing required inputs while manually hidden nodes remain omitted', () => {
    const required = fixture('binding-required-missing');
    const result = resolveDesign(required.document, required.weddingData, {
      mode: 'preview',
      asOf: '2026-01-01T00:00:00Z',
    });
    expect(result.issues.map(({ code }) => code)).toContain('BINDING_REQUIRED');
    const hidden = fixture('binding-manual-hidden');
    expect(
      resolveDesign(hidden.document, hidden.weddingData, {
        mode: 'public',
        asOf: '2026-01-01T00:00:00Z',
      }).scene.elements,
    ).toHaveLength(0);
  });

  it('formats the selected event in its declared timezone without leaking unused WeddingData', () => {
    const { document } = fixture('binding-optional-fallback');
    const weddingData = JSON.parse(
      readFileSync(resolve(root, 'sample-a.json'), 'utf8'),
    ) as WeddingData;
    const id = document.nodes.ROOT.nodes[0];
    (
      document.nodes[
        id
      ] as import('../../../src/modules/invitation-builder/domain/document.types').ElementNode
    ).props.bindings[0] = {
      target: 'text',
      source: 'wedding.date',
      eventKey: 'ceremony',
    };
    const sentinel = 'private-unused-field-sentinel';
    const result = resolveDesign(
      document,
      { ...weddingData, story: sentinel },
      {
        mode: 'public',
        asOf: '2026-01-01T00:00:00Z',
      },
    );
    expect(result.scene.elements[0].type).toBe('Text');
    if (result.scene.elements[0].type === 'Text')
      expect(result.scene.elements[0].content.text).toBe('10/01/2027');
    expect(JSON.stringify(result.scene)).not.toContain(sentinel);
    expect(result.scene).not.toHaveProperty('weddingData');
  });

  it('derives a deduplicated, protected customer field catalog from visible bindings', () => {
    const document = JSON.parse(
      readFileSync(resolve(root, 'all-elements.json'), 'utf8'),
    ) as TemplateDesign;
    const textId = document.nodes.ROOT.nodes.find(
      (id) => document.nodes[id].type.resolvedName === 'Text',
    )!;
    (
      document.nodes[
        textId
      ] as import('../../../src/modules/invitation-builder/domain/document.types').ElementNode
    ).props.bindings = [{ target: 'text', source: 'bride.name' }];
    const fields = formFieldsForDesign(document);
    expect(fields.filter((field) => field.id === 'bride.name')).toHaveLength(1);
    expect(fields.find((field) => field.id === 'wedding.event')).toMatchObject({
      eventKey: 'ceremony',
      required: true,
    });
    expect(fields.find((field) => field.id === 'wedding.event')).toMatchObject({
      type: 'date-time',
    });
    expect(fields.find((field) => field.id === 'bride.name')).toMatchObject({
      type: 'text',
    });
    expect(fields.find((field) => field.id === 'bank.message')).toMatchObject({
      auxiliary: true,
      required: false,
    });
    const hiddenId = document.nodes.ROOT.nodes.find(
      (id) => document.nodes[id].type.resolvedName === 'Text',
    )!;
    document.nodes[hiddenId].hidden = true;
    expect(
      formFieldsForDesign(document).some((field) => field.id === 'bride.name'),
    ).toBe(false);
  });
});

describe('partial event corpus', () => {
  const cases = JSON.parse(
    readFileSync(resolve(root, 'event-resolution-cases.json'), 'utf8'),
  ) as { event: unknown; code: string }[];
  for (const [index, entry] of cases.entries()) {
    it(`handles event case ${index} with required, optional and whole-object fallback`, () => {
      const document = JSON.parse(
        readFileSync(resolve(root, 'all-elements.json'), 'utf8'),
      ) as TemplateDesign;
      const id = document.nodes.ROOT.nodes.find(
        (key) => document.nodes[key].type.resolvedName === 'Calendar',
      )!;
      document.nodes.ROOT.nodes = [id];
      const node = document.nodes[
        id
      ] as import('../../../src/modules/invitation-builder/domain/document.types').ElementNode;
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
    readFileSync(resolve(root, 'blank-resolution-cases.json'), 'utf8'),
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
        readFileSync(resolve(root, 'all-elements.json'), 'utf8'),
      ) as TemplateDesign;
      const id = document.nodes.ROOT.nodes.find(
        (key) => document.nodes[key].type.resolvedName === entry.kind,
      )!;
      document.nodes.ROOT.nodes = [id];
      const node = document.nodes[
        id
      ] as import('../../../src/modules/invitation-builder/domain/document.types').ElementNode;
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
