import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { builderRequest } = vi.hoisted(() => ({ builderRequest: vi.fn() }));
vi.mock('../../src/features/invitation-builder/api/client', async (load) => ({
  ...(await load<
    typeof import('../../src/features/invitation-builder/api/client')
  >()),
  builderRequest,
}));
import { useAssetPreview } from '../../src/features/invitation-builder/assets/use-asset-preview';
import type { AssetSummary } from '../../src/features/invitation-builder/api/client';
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';

const asset: AssetSummary = {
  id: 'asset-1',
  name: 'Ảnh',
  kind: 'IMAGE',
  mimeType: 'image/webp',
  byteSize: 120,
  width: 80,
  height: 60,
  createdAt: '2026-01-01T00:00:00.000Z',
  previewUrl: '/api/v1/assets/asset-1/content',
};
function Harness({ assets }: { assets: AssetSummary[] }) {
  const urls = useAssetPreview(assets);
  return <output>{urls[asset.id] ?? ''}</output>;
}

describe('protected asset preview lifecycle', () => {
  afterEach(() => {
    cleanup();
    sessionStore.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    builderRequest.mockReset();
  });
  it('revokes owned URLs on an account switch and rejects late A bytes after A → B → A', async () => {
    const a = privateSession();
    sessionStore.set(a);
    let finish!: (value: Blob) => void;
    builderRequest.mockResolvedValueOnce(new Blob(['first']));
    builderRequest.mockImplementation(
      () =>
        new Promise<Blob>((done) => {
          finish = done;
        }),
    );
    const create = vi.fn(() => 'blob:private-A');
    const revoke = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(create);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
    const view = render(<Harness assets={[asset]} />);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    act(() => sessionStore.set({ ...a, user: { ...a.user, id: 'B' } }));
    expect(revoke).toHaveBeenCalledWith('blob:private-A');
    const finishB = finish;
    act(() => sessionStore.set(a));
    view.unmount();
    await act(async () => {
      finishB(new Blob(['B']));
      finish(new Blob(['late A']));
    });
    expect(create).toHaveBeenCalledOnce();
  });
  it('does not create a URL for preview bytes delivered after unmount', async () => {
    let finish!: (value: Blob) => void;
    builderRequest.mockImplementation(
      () =>
        new Promise<Blob>((done) => {
          finish = done;
        }),
    );
    const create = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(create);
    const view = render(<Harness assets={[asset]} />);
    view.unmount();
    await act(async () => finish(new Blob(['late'])));
    expect(create).not.toHaveBeenCalled();
  });
  it('fetches bytes through the API and revokes blob URLs when the asset selection changes', async () => {
    builderRequest.mockResolvedValue(
      new Blob(['pixels'], { type: 'image/webp' }),
    );
    const create = vi.fn(() => 'blob:asset-preview');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const view = render(<Harness assets={[asset]} />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'blob:asset-preview',
      ),
    );
    expect(builderRequest).toHaveBeenCalledWith(
      '/assets/asset-1/content',
      expect.objectContaining({ bytes: true, signal: expect.any(AbortSignal) }),
    );
    view.rerender(<Harness assets={[]} />);
    await waitFor(() =>
      expect(revoke).toHaveBeenCalledWith('blob:asset-preview'),
    );
  });
});
