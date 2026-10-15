import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorProperties } from '../../src/features/invitation-builder/editor/editor-properties';
import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';
import {
  createBlankDocument,
  validateEditorDocument,
  resolveEditorDocument,
  type CanvasNode,
} from '../../src/features/invitation-builder/document/editor-document';

const guest = () => {
  const text = primitiveNode('Text');
  if (!('textStyle' in text.props.content))
    throw new Error('Text style missing');
  return {
    ...text,
    type: { resolvedName: 'GuestName' },
    displayName: 'GuestName',
    props: {
      ...text.props,
      bindings: [],
      content: {
        label: 'Bạn thân',
        field: null,
        textStyle: text.props.content.textStyle,
      },
    },
  } as CanvasNode;
};
afterEach(cleanup);
it('shows the shared text properties while editing the guest placeholder', () => {
  const command = vi.fn();
  render(
    <EditorProperties
      id="guest"
      node={guest()}
      options={{}}
      index={0}
      count={1}
      command={command}
      onChoose={vi.fn()}
      disabled={false}
      assetUrls={{}}
    />,
  );
  expect(screen.getByText('Kiểu chữ')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Tên hiển thị mẫu'), {
    target: { value: 'Gia đình' },
  });
  expect(command).toHaveBeenLastCalledWith({
    type: 'content',
    id: 'guest',
    value: { label: 'Gia đình' },
  });
});
it('preserves guest typography through JSON and resolution and rejects invalid styles', () => {
  const doc = createBlankDocument();
  const id = crypto.randomUUID();
  doc.nodes[id] = guest();
  doc.nodes.ROOT.nodes = [id];
  const restored = JSON.parse(JSON.stringify(doc));
  expect(validateEditorDocument(restored).valid).toBe(true);
  const result = resolveEditorDocument(
    restored,
    { schemaVersion: 2, fields: {} },
    { mode: 'capture', asOf: '2026-10-15T00:00:00Z' },
  );
  expect(result.issues).toEqual([]);
  expect(result.scene.elements[0].content).toMatchObject({
    label: 'Bạn thân',
    textStyle: { fontSize: 26 },
  });
  restored.nodes[id].props.content.textStyle.fontSize = 999;
  expect(validateEditorDocument(restored).valid).toBe(false);
});
