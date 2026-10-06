import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { builderRequest, uploadBuilderAsset } = vi.hoisted(() => ({
  builderRequest: vi.fn(),
  uploadBuilderAsset: vi.fn(),
}));
vi.mock('../../src/features/invitation-builder/api/client', () => ({
  builderRequest,
  uploadBuilderAsset,
  BuilderApiError: class BuilderApiError extends Error {},
}));
vi.mock(
  '../../src/features/invitation-builder/assets/use-asset-preview',
  () => ({ useAssetPreview: () => ({}) }),
);
import { AssetLibrary } from '../../src/features/invitation-builder/assets/asset-library';

describe('template asset library', () => {
  afterEach(cleanup);
  beforeEach(() => {
    builderRequest.mockReset();
    uploadBuilderAsset.mockReset();
    builderRequest.mockResolvedValue({ items: [], nextCursor: null });
    uploadBuilderAsset.mockResolvedValue({
      id: 'a1',
      name: 'Ảnh cưới',
      kind: 'IMAGE',
      mimeType: 'image/webp',
      byteSize: 100,
      width: 80,
      height: 60,
      createdAt: '2026-01-01T00:00:00.000Z',
      previewUrl: '/api/v1/assets/a1/content',
    });
  });

  it('searches, filters to own uploads, and picks a newly uploaded image', async () => {
    const onSelect = vi.fn(),
      onClose = vi.fn();
    render(
      <AssetLibrary choice="Image" onSelect={onSelect} onClose={onClose} />,
    );
    await waitFor(() =>
      expect(builderRequest).toHaveBeenCalledWith(
        '/admin/template-assets?limit=100',
        expect.anything(),
      ),
    );
    fireEvent.change(screen.getByLabelText('Tìm ảnh'), {
      target: { value: 'Ảnh cưới' },
    });
    fireEvent.change(screen.getByLabelText('Lọc loại ảnh'), {
      target: { value: 'IMAGE' },
    });
    fireEvent.click(screen.getByLabelText('Chỉ ảnh tôi tải lên'));
    await waitFor(() =>
      expect(builderRequest).toHaveBeenCalledWith(
        expect.stringContaining('q=%E1%BA%A2nh+c%C6%B0%E1%BB%9Bi'),
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(builderRequest).toHaveBeenCalledWith(
        expect.stringContaining('mine=true'),
        expect.anything(),
      ),
    );
    fireEvent.change(screen.getByLabelText('Tên ảnh tải lên'), {
      target: { value: 'Ảnh cưới' },
    });
    fireEvent.change(screen.getByLabelText('File ảnh tải lên'), {
      target: {
        files: [
          new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' }),
        ],
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Tải ảnh lên và chọn' }),
    );
    await waitFor(() =>
      expect(uploadBuilderAsset).toHaveBeenCalledWith(
        expect.any(File),
        'Ảnh cưới',
        'IMAGE',
      ),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
  it('loads the next asset page and resets the cursor for My uploads', async () => {
    builderRequest
      .mockResolvedValueOnce({
        items: [{ id: 'a', name: 'Ảnh A' }],
        nextCursor: 'page2',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'b', name: 'Ảnh B' }],
        nextCursor: null,
      })
      .mockResolvedValue({ items: [], nextCursor: null });
    const onSelect = vi.fn();
    render(
      <AssetLibrary choice="cover" onSelect={onSelect} onClose={vi.fn()} />,
    );
    await screen.findByRole('button', { name: 'Chọn Ảnh A' });
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm ảnh' }));
    await screen.findByRole('button', { name: 'Chọn Ảnh B' });
    expect(builderRequest).toHaveBeenCalledWith(
      '/admin/template-assets?limit=100&cursor=page2',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chọn Ảnh B' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    fireEvent.click(screen.getByLabelText('Chỉ ảnh tôi tải lên'));
    await waitFor(() =>
      expect(builderRequest).toHaveBeenLastCalledWith(
        '/admin/template-assets?limit=100&mine=true',
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Tải thêm ảnh' })).toBeNull(),
    );
  });
});
