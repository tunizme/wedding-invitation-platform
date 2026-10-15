import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarWidget } from '../../src/features/invitation-builder/renderer/widgets/calendar';
import { RsvpWidget } from '../../src/features/invitation-builder/renderer/widgets/rsvp';
import { widgetNode } from '../../src/features/invitation-builder/editor/defaults';
import {
  createBlankDocument,
  validateEditorDocument,
  resolveEditorDocument,
} from '../../src/features/invitation-builder/document/editor-document';
import {
  commitDocument,
  undoDocument,
} from '../../src/features/invitation-builder/editor/editor-commands';

afterEach(cleanup);
describe('authored widget designs', () => {
  it.each(['plain', 'ribbon', 'notebook'] as const)(
    'marks the local event day in %s, including month/year boundaries',
    (variant) => {
      render(
        <CalendarWidget
          datetime="2026-12-31T20:00:00Z"
          timeZone="Asia/Ho_Chi_Minh"
          accentColor="#F396A1FF"
          variant={variant}
        />,
      );
      expect(screen.getByRole('grid')).toHaveAccessibleName(
        'Lịch tháng 1/2027',
      );
      expect(
        screen.getByRole('gridcell', { current: 'date' }),
      ).toHaveTextContent('1');
      expect(screen.queryAllByRole('columnheader')).toHaveLength(
        variant === 'plain' ? 0 : 7,
      );
    },
  );
  it('leaves weekday headers out of the plain design without changing date order', () => {
    render(
      <CalendarWidget
        datetime="2026-10-14T00:00:00+07:00"
        timeZone="Asia/Ho_Chi_Minh"
        accentColor="#F396A1FF"
        variant="plain"
      />,
    );
    expect(screen.queryByRole('columnheader')).toBeNull();
    expect(
      screen
        .getAllByRole('gridcell')
        .filter((e) => e.textContent)
        .map((e) => Number(e.textContent)),
    ).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
  it('shows the complete invitation form in preview while all controls and transport stay inert', () => {
    const submit = vi.fn();
    render(
      <RsvpWidget
        title="Xác nhận"
        mode="preview"
        displayState="open"
        design="invitation"
        onSubmit={submit}
      />,
    );
    expect(
      screen.getByRole('textbox', { name: 'Tên khách mời' }),
    ).toBeDisabled();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    for (const radio of screen.getAllByRole('radio'))
      expect(radio).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    expect(submit).not.toHaveBeenCalled();
  });
  it('changes the real RSVP attendance value from the invitation radio buttons', () => {
    const change = vi.fn();
    render(
      <RsvpWidget
        title="Xác nhận"
        mode="public"
        displayState="open"
        design="invitation"
        form={{
          name: 'An',
          attendance: 'ATTENDING',
          partySize: '1',
          message: '',
          change,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Tôi bận/ }));
    expect(change).toHaveBeenCalledWith('attendance', 'DECLINED');
  });
  it('validates new defaults, keeps old variants and rejects unknown designs', () => {
    for (const kind of ['Calendar', 'Countdown', 'RSVP'] as const) {
      const d = createBlankDocument();
      const id = '00000000-0000-4000-8000-000000000002';
      d.nodes[id] = widgetNode(kind);
      d.nodes.ROOT.nodes = [id];
      expect(validateEditorDocument(d).valid).toBe(true);
      const content = d.nodes[id].props.content as unknown as Record<
        string,
        unknown
      >;
      if (kind === 'Calendar') {
        for (const variant of [
          'classic',
          'minimal',
          'filled',
          'plain',
          'ribbon',
          'notebook',
        ]) {
          content.variant = variant;
          expect(validateEditorDocument(d).valid).toBe(true);
        }
        content.variant = 'unknown';
      } else content.design = 'unknown';
      expect(validateEditorDocument(d).valid).toBe(false);
    }
  });
  it('undoes countdown layout and dimensions together without changing its binding', () => {
    const d = createBlankDocument(),
      id = '00000000-0000-4000-8000-000000000002';
    d.nodes[id] = widgetNode('Countdown');
    d.nodes.ROOT.nodes = [id];
    const changed = commitDocument(
      { past: [], present: d, future: [] },
      {
        type: 'content',
        id,
        value: { layout: 'vertical' },
        box: { width: 55, height: 340 },
      },
    );
    const changedNode = changed.present.nodes[id];
    if (changedNode.isCanvas) throw new Error('Expected widget');
    expect(changedNode.props.bindings).toEqual(d.nodes[id].props.bindings);
    expect(changedNode.props.box.height).toBe(340);
    expect(undoDocument(changed).present).toEqual(d);
  });
  it('shows an unconfigured call button design in preview while retaining its required-data error', () => {
    const d = createBlankDocument(),
      id = '00000000-0000-4000-8000-000000000002';
    d.nodes.ROOT.nodes = [id];
    d.nodes[id] = {
      ...widgetNode('RSVP'),
      type: { resolvedName: 'Contact' },
      displayName: 'Contact',
      props: {
        ...widgetNode('RSVP').props,
        content: { label: 'Gọi ngay', field: null, phone: '' },
        bindings: [],
      },
    } as never;
    const options = { mode: 'preview' as const, asOf: '2026-10-14T00:00:00Z' };
    const preview = resolveEditorDocument(d, { schemaVersion: 1 }, options);
    expect(preview.scene.elements.some((e) => e.id === id)).toBe(true);
    expect(preview.issues.some((e) => e.code === 'BINDING_REQUIRED')).toBe(
      true,
    );
    expect(
      resolveEditorDocument(
        d,
        { schemaVersion: 1 },
        { ...options, mode: 'capture' },
      ).scene.elements,
    ).toHaveLength(0);
  });
});
