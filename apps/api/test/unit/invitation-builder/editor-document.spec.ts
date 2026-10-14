import { describe, it, expect } from 'vitest';
import {
  createBlankDocument,
  validateEditorDocument,
} from '../../../src/modules/invitation-builder/domain/editor-document';
describe('editor-document independent API contract', () => {
  it('accepts500 and rejects extra fields and invalid heights', () => {
    const value = createBlankDocument();
    expect(validateEditorDocument(value).valid).toBe(true);
    expect(validateEditorDocument({ ...value, ignored: true }).valid).toBe(
      false,
    );
    value.nodes.ROOT.props.canvas.height = 499;
    expect(validateEditorDocument(value).valid).toBe(false);
  });
  it('rejects retired authoring documents', () => {
    for (const schemaVersion of [1, 2])
      expect(
        validateEditorDocument({ ...createBlankDocument(), schemaVersion })
          .valid,
      ).toBe(false);
  });
});

describe('Phase 11 optional presentation validation', () => {
  it('accepts each page animation and rejects non-string or unknown values', () => {
    const value = createBlankDocument();
    for (const pageAnimation of [
      'none',
      'fade-all',
      'slide-all',
      'scale-all',
      'flip-all',
      'slide-mix',
      'fade-mix',
    ]) {
      expect(
        validateEditorDocument({
          ...value,
          settings: { ...value.settings, pageAnimation },
        }).valid,
      ).toBe(true);
    }
    for (const pageAnimation of [{}, [], true, 'spin']) {
      expect(
        validateEditorDocument({
          ...value,
          settings: { ...value.settings, pageAnimation },
        }).valid,
      ).toBe(false);
    }
  });
  it('validates carousel timing and contact/reminder overrides independently of the web', () => {
    const value = createBlankDocument();
    const id = '00000000-0000-4000-8000-000000000001';
    const check = (kind: string, content: Record<string, unknown>) =>
      validateEditorDocument({
        ...value,
        nodes: {
          ROOT: { ...value.nodes.ROOT, nodes: [id] },
          [id]: {
            type: { resolvedName: kind },
            displayName: kind,
            isCanvas: false,
            props: {
              box: { x: 0, y: 0, width: 400, height: 200, rotation: 0 },
              appearance: {
                opacity: 1,
                background: { kind: 'solid', color: '#FFFFFF00' },
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
                border: { width: 0, color: '#000000FF', style: 'solid' },
                shadow: null,
                borderRadius: 0,
              },
              bindings: [],
              content: { label: 'Widget', field: null, ...content },
            },
            custom: { layerName: 'Widget', locked: false, optional: false },
            hidden: false,
            parent: 'ROOT',
            nodes: [],
            linkedNodes: {},
          },
        },
      }).valid;
    expect(
      check('Carousel', {
        assetIds: [],
        transition: 'fade',
        durationSec: 0.2,
        delaySec: 0,
        autoplay: true,
      }),
    ).toBe(true);
    for (const invalid of [
      { transition: {} },
      { durationSec: 0 },
      { delaySec: -1 },
      { autoplay: 'yes' },
    ])
      expect(check('Carousel', { assetIds: [], ...invalid })).toBe(false);
    expect(
      check('Contact', {
        phone: '+84901234567',
        showIcon: false,
        buttonColor: '#112233FF',
        textColor: '#FFFFFFFF',
      }),
    ).toBe(true);
    expect(check('Contact', { phone: '+84901234567', showIcon: 'no' })).toBe(
      false,
    );
    expect(
      check('Reminder', {
        eventKey: 'ceremony',
        allDay: true,
        location: 'Hà Nội',
        description: 'Hẹn gặp',
      }),
    ).toBe(true);
    expect(check('Reminder', { eventKey: 'ceremony', allDay: 'yes' })).toBe(
      false,
    );
  });
});
