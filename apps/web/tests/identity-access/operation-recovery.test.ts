import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/identity-access/api/client', () => ({
  REQUEST_DEADLINE_MS: 15_000,
  iamRequest: vi.fn(),
}));

import { iamRequest } from '../../src/features/identity-access/api/client';
import { reconcilePendingIntent } from '../../src/features/identity-access/session/operation-recovery';
import type { SelectorRecord } from '../../src/features/identity-access/session/auth-selector';

const record: SelectorRecord = {
  state: 'SELECTED',
  attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  attemptSeq: 2,
  attemptAt: 1,
  contextId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  revision: 4,
  sessionTag: 'AAAAAAAAAAAAAAAAAAAAAA',
  pendingIntent: {
    attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    kind: 'LOCAL_LOGIN',
    expectedRevision: 4,
    intentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  },
  refreshLease: null,
  recoveryReason: null,
};

beforeEach(() => vi.mocked(iamRequest).mockReset());

describe('read-only operation recovery', () => {
  it('probes at most twice and leaves a RESERVED receipt uncertain', async () => {
    vi.mocked(iamRequest).mockResolvedValue({
      authProtocol: 2,
      intentId: record.pendingIntent!.intentId,
      state: 'RESERVED',
      outcomeCode: null,
      contextRevision: 4,
      currentSessionTag: record.sessionTag,
    });
    const result = await reconcilePendingIntent(
      record,
      () => 0,
      async () => {},
    );
    expect(result).toMatchObject({ state: 'UNCERTAIN', probes: 2 });
    expect(iamRequest).toHaveBeenCalledTimes(2);
    expect(iamRequest).toHaveBeenCalledWith(
      `/auth/contexts/${record.contextId}/intents/${record.pendingIntent!.intentId}`,
      expect.objectContaining({ method: 'GET', expectProtocol: true }),
    );
  });

  it('returns terminal evidence without replaying a mutation', async () => {
    vi.mocked(iamRequest).mockResolvedValue({
      authProtocol: 2,
      intentId: record.pendingIntent!.intentId,
      state: 'COMMITTED',
      outcomeCode: 'SESSION_ESTABLISHED',
      contextRevision: 4,
      currentSessionTag: record.sessionTag,
    });
    const result = await reconcilePendingIntent(record);
    expect(result).toMatchObject({ state: 'RECEIPT', probes: 1 });
    expect(iamRequest).toHaveBeenCalledTimes(1);
    expect(vi.mocked(iamRequest).mock.calls[0][1]?.method).toBe('GET');
  });

  it('keeps an absent intent ID uncertain without probing', async () => {
    const result = await reconcilePendingIntent({
      ...record,
      pendingIntent: { ...record.pendingIntent!, intentId: undefined },
    });
    expect(result).toEqual({ state: 'UNCERTAIN', probes: 0 });
    expect(iamRequest).not.toHaveBeenCalled();
  });
});

it('stops further read-only probes when the originating notice is superseded', async () => {
  let current = true;
  vi.mocked(iamRequest).mockResolvedValue({
    authProtocol: 2,
    state: 'RESERVED',
  });
  const result = await reconcilePendingIntent(
    record,
    () => 0,
    async () => {
      current = false;
    },
    () => current,
  );
  expect(result).toMatchObject({ state: 'UNCERTAIN', probes: 1 });
  expect(iamRequest).toHaveBeenCalledTimes(1);
});
