import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BindingPanel } from '../../src/features/invitation-builder/editor/binding-panel';
import {
  primitiveNode,
  widgetNode,
} from '../../src/features/invitation-builder/editor/defaults';

describe('author binding controls', () => {
  afterEach(cleanup);
  it('binds an image to a customer photo and can return to static content', () => {
    const onCommand = vi.fn();
    const node = primitiveNode('Image');
    const { rerender } = render(
      <BindingPanel
        id="image"
        node={node}
        onCommand={onCommand}
        disabled={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('Nguồn dữ liệu'), {
      target: { value: 'couple.photo' },
    });
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'binding',
      id: 'image',
      value: [{ target: 'assetId', source: 'couple.photo' }],
    });
    node.props.bindings = [{ target: 'assetId', source: 'couple.photo' }];
    rerender(
      <BindingPanel
        id="image"
        node={node}
        onCommand={onCommand}
        disabled={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('Nguồn dữ liệu'), {
      target: { value: '' },
    });
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'binding',
      id: 'image',
      value: [],
    });
  });
  it('does not silently make static sample text a fallback; edits fallback explicitly', () => {
    const onCommand = vi.fn(),
      node = primitiveNode('Text');
    const { rerender } = render(
      <BindingPanel
        id="text"
        node={node}
        onCommand={onCommand}
        disabled={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('Liên kết văn bản'), {
      target: { value: 'bride.name' },
    });
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'binding',
      id: 'text',
      value: [{ target: 'text', source: 'bride.name' }],
    });
    node.props.bindings = [
      { target: 'text', source: 'bride.name', fallback: 'Tên dự phòng' },
    ];
    rerender(
      <BindingPanel
        id="text"
        node={node}
        onCommand={onCommand}
        disabled={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('Văn bản dự phòng'), {
      target: { value: 'Tên mới' },
    });
    fireEvent.blur(screen.getByLabelText('Văn bản dự phòng'));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'binding',
      id: 'text',
      value: [{ target: 'text', source: 'bride.name', fallback: 'Tên mới' }],
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Xóa giá trị dự phòng' }),
    );
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'binding',
      id: 'text',
      value: [{ target: 'text', source: 'bride.name' }],
    });
  });
  it('authors a typed venue fallback and edits numeric coordinates', () => {
    const onCommand = vi.fn(),
      node = widgetNode('Map');
    const { rerender } = render(
      <BindingPanel
        id="map"
        node={node}
        onCommand={onCommand}
        disabled={false}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Thêm giá trị dự phòng' }),
    );
    const binding = onCommand.mock.lastCall![0].value[0];
    expect(binding).toEqual(
      expect.objectContaining({
        target: 'venue',
        source: 'venue',
        eventKey: 'ceremony',
        fallback: expect.objectContaining({
          latitude: expect.any(Number),
          longitude: expect.any(Number),
        }),
      }),
    );
    node.props.bindings = [binding];
    rerender(
      <BindingPanel
        id="map"
        node={node}
        onCommand={onCommand}
        disabled={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('Vĩ độ dự phòng'), {
      target: { value: '10.8' },
    });
    fireEvent.blur(screen.getByLabelText('Vĩ độ dự phòng'));
    expect(onCommand.mock.lastCall![0].value[0].fallback.latitude).toBe(10.8);
    fireEvent.click(
      screen.getByRole('button', { name: 'Xóa giá trị dự phòng' }),
    );
    expect(onCommand.mock.lastCall![0].value[0]).not.toHaveProperty('fallback');
  });
});
