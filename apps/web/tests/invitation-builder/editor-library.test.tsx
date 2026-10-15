import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/features/invitation-builder/api/client', async (load) => ({
  ...(await load<
    typeof import('../../src/features/invitation-builder/api/client')
  >()),
  builderRequest: mocks.request,
}));
vi.mock(
  '../../src/features/invitation-builder/assets/use-asset-preview',
  () => ({ useAssetPreview: () => ({}) }),
);
import { AssetLibrary } from '../../src/features/invitation-builder/editor/asset-library';

beforeEach(() => {
  mocks.request.mockReset();
  const session = privateSession();
  sessionStore.set({ ...session, user: { ...session.user, role: 'ADMIN' } });
});
afterEach(() => {
  cleanup();
  sessionStore.clear();
  vi.restoreAllMocks();
});
it('waits for server deletion even when the image is unused in the current document', async () => {
  mocks.request.mockResolvedValue({
    items: [{ id: 'image-1', name: 'Ảnh thử', kind: 'IMAGE' }],
    nextCursor: null,
  });
  let finish!: () => void;
  const onDelete = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <AssetLibrary
      kind="IMAGE"
      onAsset={vi.fn()}
      usage={() => 0}
      onDelete={onDelete}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Xóa Ảnh thử' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
  expect(onDelete).toHaveBeenCalledWith('image-1');
  expect(screen.getByRole('button', { name: 'Đang xóa…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Ảnh thử' })).toBeInTheDocument();
  await act(async () => finish());
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Xóa Ảnh thử' }),
    ).not.toBeInTheDocument(),
  );
  expect(
    mocks.request.mock.calls.some(
      ([, options]) => options?.method === 'DELETE',
    ),
  ).toBe(false);
});
it('keeps the image and allows retry after storage deletion fails', async () => {
  mocks.request.mockResolvedValue({
    items: [{ id: 'image-1', name: 'Ảnh thử', kind: 'IMAGE' }],
    nextCursor: null,
  });
  const onDelete = vi
    .fn()
    .mockRejectedValueOnce(new Error('Storage đang bận'))
    .mockResolvedValue(undefined);
  render(
    <AssetLibrary
      kind="IMAGE"
      onAsset={vi.fn()}
      usage={() => 2}
      onDelete={onDelete}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Xóa Ảnh thử' }));
  fireEvent.click(screen.getByRole('button', { name: 'Vẫn xóa' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Storage đang bận',
  );
  expect(
    screen.getByRole('button', { name: 'Xóa Ảnh thử' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vẫn xóa' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(onDelete).toHaveBeenCalledTimes(2);
});
it('cancels without deleting or removing any image', async () => {
  mocks.request.mockResolvedValue({
    items: [{ id: 'image-1', name: 'Ảnh thử', kind: 'IMAGE' }],
    nextCursor: null,
  });
  const onDelete = vi.fn();
  render(<AssetLibrary kind="IMAGE" onAsset={vi.fn()} onDelete={onDelete} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Xóa Ảnh thử' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
  expect(onDelete).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Xóa Ảnh thử' }),
  ).toBeInTheDocument();
});
it('passes the preset category to both the initial filtered request and subsequent pages', async () => {
  mocks.request.mockResolvedValue({ items: [], nextCursor: 'next-page' });
  render(<AssetLibrary kind="PRESET" onAsset={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Lời mời' }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      expect.stringContaining('category='),
      expect.anything(),
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Xem thêm' }));
  await waitFor(() => {
    const requests = mocks.request.mock.calls.map(
      ([path]) => new URL(path, 'https://local.test'),
    );
    expect(
      requests.some(
        (u) =>
          u.searchParams.get('category') === 'Lời mời' &&
          u.searchParams.get('cursor') === 'next-page',
      ),
    ).toBe(true);
  });
});
it('fetches protected template covers through the API client and revokes their object URLs', async () => {
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:private-cover');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  mocks.request.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/templates/t1/cover'
        ? new Blob(['image'], { type: 'image/png' })
        : {
            items: [
              {
                id: 't1',
                name: 'Mẫu thử',
                status: 'PUBLISHED',
                coverUrl: '/api/v1/templates/t1/cover',
              },
            ],
            nextCursor: null,
          },
    ),
  );
  const { container, unmount } = render(
    <AssetLibrary kind="TEMPLATE" onAsset={vi.fn()} />,
  );
  await waitFor(() =>
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'blob:private-cover',
    ),
  );
  expect(mocks.request).toHaveBeenCalledWith(
    '/templates/t1/cover',
    expect.objectContaining({ bytes: true, scope: expect.anything() }),
  );
  expect(create).toHaveBeenCalledOnce();
  await act(async () => unmount());
  expect(revoke).toHaveBeenCalledWith('blob:private-cover');
});

it('selects multiple images before confirming one batch and supports deselection', async () => {
  const images = [
    { id: 'image-1', name: 'Ảnh một', kind: 'IMAGE' },
    { id: 'image-2', name: 'Ảnh hai', kind: 'IMAGE' },
    { id: 'image-3', name: 'Ảnh ba', kind: 'IMAGE' },
  ];
  mocks.request.mockResolvedValue({ items: images, nextCursor: null });
  const onAsset = vi.fn();
  const onAssets = vi.fn();
  render(
    <AssetLibrary
      kind="IMAGE"
      onAsset={onAsset}
      onAssets={onAssets}
      selectionLimit={2}
    />,
  );
  const first = await screen.findByRole('button', { name: 'Ảnh một' });
  fireEvent.click(first);
  fireEvent.click(screen.getByRole('button', { name: 'Ảnh hai' }));
  expect(first).toHaveAttribute('aria-pressed', 'true');
  expect(onAsset).not.toHaveBeenCalled();
  expect(onAssets).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ảnh ba' }));
  expect(
    screen.getByText('Chỉ có thể thêm tối đa 2 ảnh nữa.'),
  ).toBeInTheDocument();
  fireEvent.click(first);
  fireEvent.click(screen.getByRole('button', { name: 'Ảnh ba' }));
  fireEvent.click(screen.getByRole('button', { name: 'Thêm 2 ảnh đã chọn' }));
  expect(onAssets).toHaveBeenCalledOnce();
  expect(onAssets).toHaveBeenCalledWith([images[1], images[2]]);
});
