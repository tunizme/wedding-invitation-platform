import type {
  RsvpItem,
  RsvpPayload,
  RsvpReceipt,
  RsvpState,
} from '../../web/src/features/invitations/rsvp-api';
export type { RsvpPayload, RsvpState };
export class PublicRsvpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter = 0,
  ) {
    super(code);
  }
}
export type Scenario = 'normal' | 'loading' | 'empty' | 'error' | 'conflict';
export const mockState: {
  scenario: Scenario;
  openBySlug: Record<string, boolean>;
  itemsBySlug: Record<string, RsvpItem[]>;
  receipts: Map<string, RsvpReceipt>;
} = {
  scenario: 'normal',
  openBySlug: {},
  itemsBySlug: {},
  receipts: new Map(),
};
export function resetRsvps() {
  mockState.openBySlug = {};
  mockState.itemsBySlug = {
    '50000000-0000-4000-8000-000000000001': [
      {
        id: '60000000-0000-4000-8000-000000000001',
        name: 'Hoàng Linh',
        attendance: 'ATTENDING',
        partySize: 2,
        message: 'Chúc hai bạn luôn hạnh phúc!',
        createdAt: '2026-10-09T03:00:00Z',
      },
      {
        id: '60000000-0000-4000-8000-000000000002',
        name: 'Nguyễn Hà',
        attendance: 'DECLINED',
        partySize: 0,
        message: 'Mình ở xa, gửi hai bạn thật nhiều lời chúc.',
        createdAt: '2026-10-08T09:00:00Z',
      },
    ],
  };
  mockState.receipts.clear();
}
resetRsvps();
const wait = () => new Promise((resolve) => setTimeout(resolve, 350));
export async function getPublicRsvpState(slug: string): Promise<RsvpState> {
  await wait();
  if (mockState.scenario === 'error')
    throw new PublicRsvpError(0, 'NETWORK_ERROR');
  return { available: true, open: mockState.openBySlug[slug] ?? true };
}
export async function submitPublicRsvp(
  slug: string,
  key: string,
  payload: RsvpPayload,
): Promise<RsvpReceipt> {
  await wait();
  const receiptKey = `${slug}:${key}`;
  const prior = mockState.receipts.get(receiptKey);
  if (prior) return prior;
  if (mockState.openBySlug[slug] === false)
    throw new PublicRsvpError(409, 'RSVP_CLOSED');
  if (mockState.scenario === 'error')
    throw new PublicRsvpError(0, 'NETWORK_ERROR');
  const receipt = {
    receiptId: crypto.randomUUID(),
    acceptedAt: new Date().toISOString(),
  };
  mockState.receipts.set(receiptKey, receipt);
  const items = (mockState.itemsBySlug[slug] ??= []);
  items.unshift({
    ...payload,
    partySize: payload.attendance === 'DECLINED' ? 0 : payload.partySize,
    id: receipt.receiptId,
    createdAt: receipt.acceptedAt,
  });
  return receipt;
}
