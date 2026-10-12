import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useRef, useState } from 'react';
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
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';

describe('template asset library', () => {
  afterEach(cleanup);
  beforeEach(() => {
    sessionStore.clear();
    const session = privateSession();
    sessionStore.set({ ...session, user: { ...session.user, role: 'ADMIN' } });
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
        'template',
        expect.objectContaining({ scope: expect.any(Object) }),
      ),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
  it('opens as a named modal dialog with the search field focused', async () => {
    render(
      <AssetLibrary choice="Image" onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Thư viện ảnh' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByLabelText('Tìm ảnh')).toHaveFocus();
  });

  it('returns focus to the explicit trigger even when the browser never focused it', async () => {
    function Host() {
      const trigger = useRef<HTMLButtonElement>(null);
      const [open, setOpen] = useState(false);
      return (
        <>
          <button ref={trigger} type="button" onClick={() => setOpen(true)}>
            Thêm hình ảnh
          </button>
          {open && (
            <AssetLibrary
              choice="Image"
              returnFocusRef={trigger}
              onSelect={vi.fn()}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }
    render(<Host />);
    // WebKit does not focus a clicked button: nothing is focused at open time.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm hình ảnh' }));
    await screen.findByRole('dialog', { name: 'Thư viện ảnh' });
    fireEvent.click(screen.getByRole('button', { name: 'Đóng thư viện' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Thêm hình ảnh' })).toHaveFocus();
  });

  it('recovers from a failed search by running another query', async () => {
    builderRequest.mockRejectedValueOnce(new Error('offline'));
    builderRequest.mockResolvedValue({
      items: [{ id: 'a', name: 'Ảnh A', width: 10, height: 10 }],
      nextCursor: null,
    });
    render(
      <AssetLibrary choice="Image" onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải thư viện ảnh.',
    );
    fireEvent.change(screen.getByLabelText('Tìm ảnh'), {
      target: { value: 'A' },
    });
    await screen.findByRole('button', { name: 'Chọn Ảnh A' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps loaded assets when a later page fails and lets the Admin retry', async () => {
    builderRequest
      .mockResolvedValueOnce({
        items: [{ id: 'a', name: 'Ảnh A', width: 10, height: 10 }],
        nextCursor: 'page2',
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        items: [{ id: 'b', name: 'Ảnh B', width: 10, height: 10 }],
        nextCursor: null,
      });
    render(
      <AssetLibrary choice="Image" onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    await screen.findByRole('button', { name: 'Chọn Ảnh A' });
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm ảnh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải trang ảnh tiếp theo.',
    );
    expect(screen.getByRole('button', { name: 'Chọn Ảnh A' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm ảnh' }));
    await screen.findByRole('button', { name: 'Chọn Ảnh B' });
    expect(screen.getByRole('button', { name: 'Chọn Ảnh A' })).toBeVisible();
  });

  it('shows an upload failure, keeps the dialog open and allows a retry that selects the asset', async () => {
    uploadBuilderAsset.mockRejectedValueOnce(new Error('too large'));
    const onSelect = vi.fn();
    render(
      <AssetLibrary choice="Image" onSelect={onSelect} onClose={vi.fn()} />,
    );
    await screen.findByRole('dialog', { name: 'Thư viện ảnh' });
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải ảnh lên.',
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Tải ảnh lên và chọn' }),
    );
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a1' }),
      ),
    );
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
      expect.objectContaining({ scope: expect.any(Object) }),
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
