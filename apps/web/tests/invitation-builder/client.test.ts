import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock(
  '../../src/features/identity-access/session/refresh-coordinator',
  () => ({ bootstrapSession: refresh }),
);
import { createOperationScope } from '../../src/features/identity-access/session/operation-scope';
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';
const owner = privateSession({ accessToken: 'old-token' });
beforeEach(() => {
  sessionStore.clear();
  sessionStore.set(owner);
});
import {
  builderRequest,
  uploadBuilderAsset,
} from '../../src/features/invitation-builder/api/client';
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
    refresh.mockImplementation(async () => {
      const renewed = { ...owner, accessToken: 'fresh-token' };
      sessionStore.set(renewed);
      return renewed;
    });
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
  describe('captured owner scope', () => {
    it('does not retry a resource after its scope is disposed during renewal', async () => {
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api/v1');
      const scope = createOperationScope('rsvp:old-resource');
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 401 }));
      vi.stubGlobal('fetch', fetcher);
      let release!: (value: typeof owner) => void;
      refresh.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const pending = builderRequest('/invitations/old-resource/rsvp-state', {
        scope,
        method: 'PATCH',
        body: { expectedControlVersion: 1, open: false },
      });
      const outcome = expect(pending).rejects.toMatchObject({
        code: 'SUPERSEDED',
      });
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
      scope.dispose();
      release(owner);
      await outcome;
      expect(fetcher).toHaveBeenCalledOnce();
    });
    for (const cancellation of ['caller', 'scope', 'deadline'] as const) {
      it(`bounds stalled successful JSON parsing on ${cancellation} cancellation`, async () => {
        vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api/v1');
        vi.useFakeTimers();
        const scope = createOperationScope('stalled-body');
        const controller = new AbortController();
        const json = vi.fn(() => new Promise(() => {}));
        const fetcher = vi
          .fn()
          .mockResolvedValue({ ok: true, status: 200, json });
        vi.stubGlobal('fetch', fetcher);
        try {
          const pending = builderRequest('/invitations/example', {
            scope,
            signal: controller.signal,
          });
          const outcome = expect(pending).rejects.toMatchObject({
            code: cancellation === 'scope' ? 'SUPERSEDED' : 'REQUEST_CANCELLED',
          });
          await vi.advanceTimersByTimeAsync(0);
          expect(json).toHaveBeenCalledOnce();
          if (cancellation === 'caller') controller.abort();
          else if (cancellation === 'scope') scope.dispose();
          else await vi.advanceTimersByTimeAsync(15_000);
          await outcome;
          expect(fetcher).toHaveBeenCalledOnce();
          expect(refresh).not.toHaveBeenCalled();
        } finally {
          scope.dispose();
          vi.useRealTimers();
        }
      });
    }
    const accountB = (extra: Record<string, unknown> = {}) =>
      privateSession({
        accessToken: 'token-B',
        user: {
          ...owner.user,
          id: '22222222-2222-4222-8222-222222222222',
          email: 'person-b@example.test',
        },
        ...extra,
      });
    const base = () =>
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api/v1');

    it('does not retry A payload as B when the account changes during a stale-401 refresh', async () => {
      base();
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response('{}', { status: 401 }));
      vi.stubGlobal('fetch', fetcher);
      refresh.mockImplementation(async () => {
        const next = accountB();
        sessionStore.set(next);
        return next;
      });
      await expect(
        builderRequest('/invitations/example', {
          method: 'PATCH',
          body: { expectedVersion: 3, private: 'A only' },
        }),
      ).rejects.toMatchObject({ status: 409, code: 'SUPERSEDED' });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('rejects a captured scope before any dispatch once the owner changed', async () => {
      base();
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const scope = createOperationScope('resource');
      sessionStore.set(accountB());
      await expect(
        builderRequest('/invitations/example', { scope }),
      ).rejects.toMatchObject({ code: 'SUPERSEDED' });
      expect(fetcher).not.toHaveBeenCalled();
      scope.dispose();
    });

    it('never returns data parsed after the identity changed', async () => {
      base();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => {
          await gate;
          return new Response('{"private":"A"}', { status: 200 });
        }),
      );
      const pending = builderRequest('/invitations/example');
      sessionStore.set(accountB());
      release();
      await expect(pending).rejects.toMatchObject({ code: 'SUPERSEDED' });
    });

    it('suppresses an error body that arrives after the identity changed', async () => {
      base();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => {
          await gate;
          return new Response('{"code":"VERSION_CONFLICT"}', { status: 409 });
        }),
      );
      const pending = builderRequest('/invitations/example');
      sessionStore.set(accountB());
      release();
      await expect(pending).rejects.toMatchObject({
        code: 'SUPERSEDED',
        status: 409,
      });
    });

    it('cancels the request when the caller aborts', async () => {
      base();
      let sent: AbortSignal | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, init: RequestInit) => {
          sent = init.signal as AbortSignal;
          return new Promise(() => {});
        }),
      );
      const controller = new AbortController();
      const pending = builderRequest('/invitations/example', {
        signal: controller.signal,
      });
      await Promise.resolve();
      controller.abort();
      await expect(pending).rejects.toMatchObject({
        code: 'REQUEST_CANCELLED',
      });
      expect(sent?.aborted).toBe(true);
    });

    it('enforces the 15s deadline even when the caller never aborts', async () => {
      base();
      vi.useFakeTimers();
      try {
        let sent: AbortSignal | undefined;
        vi.stubGlobal(
          'fetch',
          vi.fn().mockImplementation((_url: string, init: RequestInit) => {
            sent = init.signal as AbortSignal;
            return new Promise(() => {});
          }),
        );
        const pending = builderRequest('/invitations/example');
        const outcome = expect(pending).rejects.toMatchObject({
          code: 'REQUEST_CANCELLED',
        });
        await vi.advanceTimersByTimeAsync(15_000);
        await outcome;
        expect(sent?.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps a deadline when the caller signal is also provided', async () => {
      base();
      vi.useFakeTimers();
      try {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockImplementation(() => new Promise(() => {})),
        );
        const controller = new AbortController();
        const pending = builderRequest('/invitations/example', {
          signal: controller.signal,
        });
        const outcome = expect(pending).rejects.toMatchObject({
          code: 'REQUEST_CANCELLED',
        });
        await vi.advanceTimersByTimeAsync(15_000);
        await outcome;
        expect(controller.signal.aborted).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
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
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'asset-id',
          name: 'Ảnh',
          kind: 'IMAGE',
          mimeType: 'image/webp',
          byteSize: 100,
          width: 80,
          height: 60,
          createdAt: '2026-01-01T00:00:00.000Z',
          previewUrl: '/api/v1/assets/asset-id/content',
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', {
      type: 'image/png',
    });
    await uploadBuilderAsset(file, 'Ảnh', 'IMAGE');
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/admin/template-assets');
    expect(url).not.toContain('token');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer old-token' });
    expect(
      (init.headers as Record<string, string>)['Content-Type'],
    ).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('name')).toBe('Ảnh');
    expect(form.get('kind')).toBe('IMAGE');
    const uploaded = form.get('file') as File;
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded).toMatchObject({
      name: 'photo.png',
      type: 'image/png',
      size: 3,
    });
  });
});
