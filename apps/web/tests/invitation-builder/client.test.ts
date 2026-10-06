import { afterEach, describe, expect, it, vi } from 'vitest';
const { refresh, get } = vi.hoisted(() => ({
  refresh: vi.fn(),
  get: vi.fn(() => ({ accessToken: 'old-token' })),
}));
vi.mock(
  '../../src/features/identity-access/session/refresh-coordinator',
  () => ({ bootstrapSession: refresh }),
);
vi.mock('../../src/features/identity-access/session/store', () => ({
  sessionStore: { get },
}));
import { builderRequest, uploadBuilderAsset } from '../../src/features/invitation-builder/api/client';
describe('builder session-aware transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  it('refreshes once on 401 while preserving the original version and payload', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api/v1');
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response('{"editVersion":8}', { status: 200 }),
      );
    vi.stubGlobal('fetch', fetcher);
    refresh.mockResolvedValue({ accessToken: 'fresh-token' });
    const body = { expectedVersion: 7, document: { schemaVersion: 1 } };
    expect(
      await builderRequest('/admin/templates/example/draft', {
        method: 'PATCH',
        body,
      }),
    ).toEqual({ editVersion: 8 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    const first = fetcher.mock.calls[0][1] as RequestInit,
      second = fetcher.mock.calls[1][1] as RequestInit;
    expect(second.body).toBe(first.body);
    expect(second.headers).toMatchObject({
      Authorization: 'Bearer fresh-token',
    });
    expect(second).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  });
  it('does not retry conflicts, storage failures or network failures as a new mutation', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api/v1');
    for (const status of [409, 503]) {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          new Response('{"code":"VERSION_CONFLICT"}', { status }),
        );
      vi.stubGlobal('fetch', fetcher);
      await expect(
        builderRequest('/admin/templates/example', {
          method: 'PATCH',
          body: { expectedVersion: 1 },
        }),
      ).rejects.toMatchObject({ status });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    expect(refresh).not.toHaveBeenCalled();
  });
  it('rejects foreign URLs, traversal and encoded route manipulation before sending credentials', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    for (const path of [
      'https://foreign.test/assets',
      '/assets/../auth',
      '/assets/%2e%2e/auth',
      '/assets\\foreign',
      '/admin/templates#secret',
    ])
      await expect(builderRequest(path)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uploads multipart bytes without setting a boundary manually or putting auth in the URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api/v1');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'asset-id', name: 'Ảnh', kind: 'IMAGE', mimeType: 'image/webp', byteSize: 100,
      width: 80, height: 60, createdAt: '2026-01-01T00:00:00.000Z', previewUrl: '/api/v1/assets/asset-id/content',
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    await uploadBuilderAsset(file, 'Ảnh', 'IMAGE');
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/admin/template-assets');
    expect(url).not.toContain('token');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer old-token' });
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('name')).toBe('Ảnh');
    expect(form.get('kind')).toBe('IMAGE');
    const uploaded = form.get('file') as File;
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded).toMatchObject({ name: 'photo.png', type: 'image/png', size: 3 });
  });
});
