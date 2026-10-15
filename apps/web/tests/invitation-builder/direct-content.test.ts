import { describe, expect, it } from 'vitest';
import {
  type CanvasNode,
  createBlankDocument,
  resolveEditorDocument,
  validateEditorDocument,
} from '../../src/features/invitation-builder/document/editor-document';
import { directEditorDocument } from '../../src/features/invitation-builder/document/direct-editor-document';
import {
  primitiveNode,
  widgetNode,
} from '../../src/features/invitation-builder/editor/defaults';
import { applyDocumentCommand } from '../../src/features/invitation-builder/editor/editor-commands';

describe('admin authored content without data binding controls', () => {
  it('materializes legacy bound text and events and keeps the source unchanged', () => {
    const source = createBlankDocument(),
      text = primitiveNode('Text'),
      calendar = widgetNode('Calendar');
    text.props.bindings = [{ target: 'text', source: 'bride.name' }];
    calendar.props.bindings = [
      { target: 'event', source: 'wedding.event', eventKey: 'ceremony' },
    ];
    const textId = crypto.randomUUID(),
      calendarId = crypto.randomUUID();
    source.nodes[textId] = text;
    source.nodes[calendarId] = calendar;
    source.nodes.ROOT.nodes = [textId, calendarId];
    const data = {
      schemaVersion: 1 as const,
      bride: { name: 'Nguyễn Ánh' },
      events: {
        ceremony: {
          datetime: '2027-02-20T10:00:00+07:00',
          timeZone: 'Asia/Ho_Chi_Minh',
        },
      },
    };
    const direct = directEditorDocument(source, data);
    expect((direct.nodes[textId] as CanvasNode).props.content).toMatchObject({
      text: 'Nguyễn Ánh',
    });
    expect(
      (direct.nodes[calendarId] as CanvasNode).props.content,
    ).toMatchObject({
      event: data.events.ceremony,
    });
    expect((direct.nodes[textId] as CanvasNode).props.bindings).toEqual([]);
    expect(source.nodes[textId].props.bindings).toHaveLength(1);
    expect(validateEditorDocument(direct).valid).toBe(true);
    const rendered = resolveEditorDocument(
      direct,
      { schemaVersion: 2, fields: {} },
      { mode: 'capture', asOf: '2026-01-01T00:00:00Z' },
    );
    expect(rendered.issues).toEqual([]);
    expect(rendered.scene.elements).toHaveLength(2);
  });
  it('accepts directly authored calendar, map, bank and timeline content', () => {
    let doc = createBlankDocument();
    const ids: Record<string, string> = {};
    for (const kind of [
      'Calendar',
      'Countdown',
      'Map',
      'QRBank',
      'Timeline',
    ] as const) {
      const node = widgetNode(kind);
      ids[kind] = crypto.randomUUID();
      doc.nodes[ids[kind]] = node;
      doc.nodes.ROOT.nodes.push(ids[kind]);
    }
    const event = {
      datetime: '2027-02-20T10:00:00+07:00',
      timeZone: 'Asia/Ho_Chi_Minh',
    };
    for (const id of ['Calendar', 'Countdown'])
      doc = applyDocumentCommand(doc, {
        type: 'content',
        id: ids[id],
        value: { event },
      });
    doc = applyDocumentCommand(doc, {
      type: 'content',
      id: ids.Map,
      value: {
        venue: {
          address: 'Hà Nội',
        },
      },
    });
    doc = applyDocumentCommand(doc, {
      type: 'content',
      id: ids.QRBank,
      value: {
        bank: {
          bin: '970436',
          account: '123456789',
          recipientName: 'NGUYEN ANH',
          message: 'MUNG CUOI',
        },
      },
    });
    doc = applyDocumentCommand(doc, {
      type: 'content',
      id: ids.Timeline,
      value: {
        entries: [
          { id: crypto.randomUUID(), title: 'Đón khách', dateLabel: '10:00' },
        ],
      },
    });
    const rendered = resolveEditorDocument(
      doc,
      { schemaVersion: 2, fields: {} },
      { mode: 'capture', asOf: '2026-01-01T00:00:00Z' },
    );
    expect(rendered.issues).toEqual([]);
    expect(rendered.scene.elements).toHaveLength(5);
    expect(
      rendered.scene.elements.find((e) => e.type === 'QRBank')?.content,
    ).toHaveProperty('qrPayload');
  });
});
