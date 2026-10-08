import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  iamRequest,
} from '../../src/features/identity-access/api/client';

const CONTEXT = '0f0e5a2c-6b1d-4c6a-9a51-2a4a0b6f9d10';
const INTENT = '1f0e5a2c-6b1d-4c6a-9a51-2a4a0b6f9d10';

describe('006 IAM transport', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test/api/v1');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('adds auth context headers only when provided', async () => {
    const fetchMock = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(JSON.stringify({ authProtocol: 2 }), { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await iamRequest('/auth/refresh', {
      method: 'POST',
      cookieAuth: true,
      auth: {
        contextId: CONTEXT,
        intentId: INTENT,
        sessionTag: 'A'.repeat(22),
      },
      expectProtocol: true,
    });
    const headers = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers['X-Auth-Context']).toBe(CONTEXT);
    expect(headers['X-Auth-Intent']).toBe(INTENT);
    expect(headers['X-Auth-Session-Tag']).toBe('A'.repeat(22));
    await iamRequest('/auth/csrf', { cookieAuth: true });
    const plain = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(plain).not.toHaveProperty('X-Auth-Context');
  });

  it('rejects a 2xx response without authProtocol 2 when the protocol is expected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'legacy' }), {
          status: 200,
        }),
      ),
    );
    await expect(
      iamRequest('/auth/refresh', { method: 'POST', expectProtocol: true }),
    ).rejects.toMatchObject({
      code: 'PROTOCOL_MISMATCH',
      knowledge: 'COMPLETED',
    });
  });

  it('classifies operation knowledge', async () => {
    // Invalid path / missing base: nothing was dispatched.
    await expect(iamRequest('https://evil.test/auth/x')).rejects.toMatchObject({
      knowledge: 'NOT_DISPATCHED',
    });
    const aborted = new AbortController();
    aborted.abort();
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      iamRequest('/auth/login', { method: 'POST', signal: aborted.signal }),
    ).rejects.toMatchObject({ knowledge: 'NOT_DISPATCHED' });

    // Network failure after dispatch: outcome unknown.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await expect(
      iamRequest('/auth/login', { method: 'POST' }),
    ).rejects.toMatchObject({ status: 0, knowledge: 'UNCERTAIN' });

    // Headers arrived but the body is unreadable: server may have committed.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not json', { status: 200 })),
    );
    await expect(
      iamRequest('/auth/login', { method: 'POST' }),
    ).rejects.toMatchObject({ knowledge: 'UNCERTAIN' });

    // Parsed problem response: completed (not success).
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: 'SUPERSEDED' }), { status: 409 }),
        ),
    );
    const error = await iamRequest('/auth/login', { method: 'POST' }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'SUPERSEDED',
      knowledge: 'COMPLETED',
    });
  });

  it('combines a caller signal with the 15s deadline instead of replacing it', async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        seen = init.signal ?? undefined;
        return new Promise((_resolve, reject) =>
          init.signal?.addEventListener('abort', () =>
            reject(new Error('abort')),
          ),
        );
      }),
    );
    const caller = new AbortController();
    const pending = iamRequest('/auth/login', {
      method: 'POST',
      signal: caller.signal,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(seen?.aborted).toBe(true);
    expect(await pending).toMatchObject({ knowledge: 'UNCERTAIN' });
    expect(caller.signal.aborted).toBe(false);
  });
  for (const status of [200, 409, 500]) {
    it(`keeps the deadline through a stalled ${status} response body`, async () => {
      vi.useFakeTimers();
      let signal!: AbortSignal;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          signal = init.signal!;
          return {
            status,
            ok: status === 200,
            json: () =>
              new Promise((_resolve, reject) => {
                signal.addEventListener(
                  'abort',
                  () => reject(new Error('aborted body')),
                  { once: true },
                );
              }),
          };
        }),
      );
      const pending = iamRequest('/auth/login', { method: 'POST' }).catch(
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(15_001);
      expect(signal.aborted).toBe(true);
      expect(await pending).toMatchObject({ knowledge: 'UNCERTAIN' });
    });
  }

  it('forwards caller cancellation while the response body is pending', async () => {
    const caller = new AbortController();
    let signal!: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        signal = init.signal!;
        return {
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                'abort',
                () => reject(new Error('aborted body')),
                { once: true },
              );
            }),
        };
      }),
    );
    const pending = iamRequest('/auth/login', {
      method: 'POST',
      signal: caller.signal,
    }).catch((error: unknown) => error);
    await Promise.resolve();
    await Promise.resolve();
    caller.abort();
    expect(signal.aborted).toBe(true);
    expect(await pending).toMatchObject({ knowledge: 'UNCERTAIN' });
  });

  for (const status of [400, 409, 500]) {
    it(`unreadable ${status} response body remains UNCERTAIN with safe status messaging`, async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('{truncated', { status })),
      );
      await expect(
        iamRequest('/auth/login', { method: 'POST' }),
      ).rejects.toMatchObject({ status, knowledge: 'UNCERTAIN' });
    });
  }
});
