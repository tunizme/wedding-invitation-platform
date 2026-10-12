import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { builderRequest } = vi.hoisted(() => ({ builderRequest: vi.fn() }));
vi.mock('../../src/features/invitation-builder/api/client', () => ({
  builderRequest,
  uploadBuilderAsset: vi.fn(),
  BuilderApiError: class BuilderApiError extends Error {},
}));
vi.mock(
  '../../src/features/invitation-builder/assets/use-asset-preview',
  () => ({
    useAssetPreview: () => ({}),
  }),
);
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';
import { BindingPanel } from '../../src/features/invitation-builder/editor/binding-panel';
import {
  primitiveNode,
  widgetNode,
} from '../../src/features/invitation-builder/editor/defaults';

describe('author binding controls', () => {
  afterEach(() => {
    cleanup();
    sessionStore.clear();
  });
  beforeEach(() => {
    const session = privateSession();
    sessionStore.clear();
    sessionStore.set({ ...session, user: { ...session.user, role: 'ADMIN' } });
    builderRequest.mockReset();
    builderRequest.mockResolvedValue({
      items: [{ id: 'img-1', name: 'Ảnh 1', width: 10, height: 10 }],
      nextCursor: null,
    });
  });
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
  describe('fallback image library (second entry owner)', () => {
    const bound = () => {
      const node = primitiveNode('Image');
      node.props.bindings = [{ target: 'assetId', source: 'couple.photo' }];
      return node;
    };

    it('selects an allowed Admin image as the fallback and returns focus to its trigger', async () => {
      const onCommand = vi.fn();
      render(
        <BindingPanel
          id="image"
          node={bound()}
          onCommand={onCommand}
          disabled={false}
        />,
      );
      const trigger = screen.getByRole('button', {
        name: 'Thêm giá trị dự phòng',
      });
      fireEvent.click(trigger);
      expect(
        await screen.findByRole('dialog', { name: 'Thư viện ảnh' }),
      ).toBeInTheDocument();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Chọn Ảnh 1' }),
      );
      expect(onCommand).toHaveBeenLastCalledWith({
        type: 'binding',
        id: 'image',
        value: [
          { target: 'assetId', source: 'couple.photo', fallback: 'img-1' },
        ],
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(trigger).toHaveFocus();
    });

    it('closes without changing the binding and restores the trigger focus', async () => {
      const onCommand = vi.fn();
      render(
        <BindingPanel
          id="image"
          node={bound()}
          onCommand={onCommand}
          disabled={false}
        />,
      );
      const trigger = screen.getByRole('button', {
        name: 'Thêm giá trị dự phòng',
      });
      fireEvent.click(trigger);
      await screen.findByRole('dialog', { name: 'Thư viện ảnh' });
      fireEvent.click(screen.getByRole('button', { name: 'Đóng thư viện' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onCommand).not.toHaveBeenCalled();
      expect(trigger).toHaveFocus();
    });

    it('falls back to the binding panel when the trigger disappears', async () => {
      const node = bound();
      const props = { id: 'image', onCommand: vi.fn(), disabled: false };
      const { rerender } = render(<BindingPanel {...props} node={node} />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Thêm giá trị dự phòng' }),
      );
      await screen.findByRole('dialog', { name: 'Thư viện ảnh' });
      // The binding is removed elsewhere, so the trigger (and library) unmount.
      node.props.bindings = [];
      rerender(<BindingPanel {...props} node={node} />);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(
        screen.getByRole('group', { name: 'Liên kết dữ liệu' }),
      ).toHaveFocus();
    });
  });
});
