import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { builderRequest } = vi.hoisted(() => ({ builderRequest: vi.fn() }));
vi.mock('../../src/features/invitation-builder/api/client', async (load) => ({
  ...(await load<typeof import('../../src/features/invitation-builder/api/client')>()),
  builderRequest,
}));
import { useAssetPreview } from '../../src/features/invitation-builder/assets/use-asset-preview';
import type { AssetSummary } from '../../src/features/invitation-builder/api/client';

const asset: AssetSummary = {
  id: 'asset-1', name: 'Ảnh', kind: 'IMAGE', mimeType: 'image/webp', byteSize: 120,
  width: 80, height: 60, createdAt: '2026-01-01T00:00:00.000Z', previewUrl: '/api/v1/assets/asset-1/content',
};
function Harness({ assets }: { assets: AssetSummary[] }) {
  const urls = useAssetPreview(assets);
  return <output>{urls[asset.id] ?? ''}</output>;
}

describe('protected asset preview lifecycle', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); builderRequest.mockReset(); });
  it('fetches bytes through the API and revokes blob URLs when the asset selection changes', async () => {
    builderRequest.mockResolvedValue(new Blob(['pixels'], { type: 'image/webp' }));
    const create = vi.fn(() => 'blob:asset-preview');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const view = render(<Harness assets={[asset]} />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('blob:asset-preview'));
    expect(builderRequest).toHaveBeenCalledWith('/assets/asset-1/content', expect.objectContaining({ bytes: true, signal: expect.any(AbortSignal) }));
    view.rerender(<Harness assets={[]} />);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:asset-preview'));
  });
});
