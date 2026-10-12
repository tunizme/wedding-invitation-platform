import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';
import type { OperationScope } from '../../src/features/identity-access/session/operation-scope';
const mocks = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }));
vi.mock('../../src/features/invitation-builder/api/client', async (load) => ({
  ...(await load<
    typeof import('../../src/features/invitation-builder/api/client')
  >()),
  builderRequest: mocks.request,
  uploadBuilderAsset: mocks.upload,
}));
vi.mock(
  '../../src/features/invitation-builder/assets/use-asset-preview',
  () => ({ useAssetPreview: () => ({}) }),
);
import { AssetLibrary } from '../../src/features/invitation-builder/assets/asset-library';
const a = privateSession();
const admin = { ...a, user: { ...a.user, role: 'ADMIN' as const } };
const asset = { id: 'A', name: 'Private A', width: 80, height: 60 };
beforeEach(() => {
  mocks.request.mockReset();
  mocks.upload.mockReset();
  sessionStore.clear();
  sessionStore.set(admin);
});
afterEach(() => {
  cleanup();
  sessionStore.clear();
});
describe('asset library owner and query generation (005 US1)', () => {
  it('rejects late search results when the next query fails', async () => {
    let finish!: (value: unknown) => void;
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    mocks.request.mockRejectedValue(new Error('unavailable'));
    render(
      <AssetLibrary choice="Image" onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Tìm ảnh'), {
      target: { value: 'new query' },
    });
    await screen.findByRole('alert');
    await act(async () => finish({ items: [asset], nextCursor: 'old-page' }));
    expect(screen.queryByRole('button', { name: 'Chọn Private A' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tải thêm ảnh' })).toBeNull();
  });
  it('disposes an upload when owner changes and never selects the old asset', async () => {
    mocks.request.mockResolvedValue({ items: [], nextCursor: null });
    let finish!: (value: unknown) => void;
    mocks.upload.mockImplementation(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    const select = vi.fn();
    render(<AssetLibrary choice="Image" onSelect={select} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('File ảnh tải lên'), {
      target: { files: [new File(['pixels'], 'A.png', { type: 'image/png' })] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Tải ảnh lên và chọn' }),
    );
    const scope = mocks.upload.mock.calls[0][4]?.scope as OperationScope;
    expect(scope).toBeDefined();
    act(() => sessionStore.set({ ...admin, user: { ...admin.user, id: 'B' } }));
    await act(async () => finish(asset));
    expect(scope.signal.aborted).toBe(true);
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tên ảnh tải lên')).toHaveValue('');
  });
  it('fences more and upload completions when library choice changes', async () => {
    mocks.request.mockResolvedValue({ items: [asset], nextCursor: 'cursor-A' });
    const select = vi.fn();
    const view = render(
      <AssetLibrary choice="Image" onSelect={select} onClose={vi.fn()} />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Tải thêm ảnh' }),
    );
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    const scope = mocks.request.mock.calls[1][1]?.scope as OperationScope;
    expect(scope).toBeDefined();
    view.rerender(
      <AssetLibrary choice="background" onSelect={select} onClose={vi.fn()} />,
    );
    expect(scope.signal.aborted).toBe(true);
    expect(screen.getByLabelText('Loại ảnh tải lên')).toHaveValue('BACKGROUND');
  });
});

describe('005 Customer image library capability', () => {
  it('requires the explicit Customer role and exposes only image selection/upload', async () => {
    sessionStore.set(a);
    mocks.request.mockResolvedValue({ items: [asset], nextCursor: null });
    const select = vi.fn();
    const view = render(
      <AssetLibrary choice="Image" onSelect={select} onClose={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Tìm ảnh')).toBeNull();
    view.rerender(
      <AssetLibrary
        expectedRole="CUSTOMER"
        choice="Image"
        onSelect={select}
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole('button', { name: 'Chọn Private A' });
    expect(mocks.request.mock.calls.at(-1)?.[0]).toContain('kind=IMAGE');
    expect(screen.queryByRole('option', { name: 'Trang trí' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Nền' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chọn Private A' }));
    expect(select).toHaveBeenCalledWith(asset);
    mocks.upload.mockResolvedValue(asset);
    fireEvent.change(screen.getByLabelText('File ảnh tải lên'), {
      target: {
        files: [new File(['pixels'], 'new.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Tải ảnh lên và chọn' }),
    );
    await waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.any(File),
        'new.png',
        'IMAGE',
        'customer',
        expect.objectContaining({ scope: expect.anything() }),
      ),
    );
    view.rerender(
      <AssetLibrary
        expectedRole="CUSTOMER"
        choice="background"
        onSelect={select}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Tìm ảnh')).toBeNull();
  });
});
