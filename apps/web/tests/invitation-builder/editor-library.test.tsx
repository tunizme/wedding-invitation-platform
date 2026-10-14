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
