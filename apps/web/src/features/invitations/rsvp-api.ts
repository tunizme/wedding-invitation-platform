'use client';
export type RsvpPayload = {
  name: string;
  attendance: 'ATTENDING' | 'DECLINED';
  partySize: number;
  message: string;
};
export type RsvpReceipt = { receiptId: string; acceptedAt: string };
export type RsvpState = { open: boolean; available: boolean };
export type RsvpItem = {
  id: string;
  name: string;
  attendance: 'ATTENDING' | 'DECLINED';
  partySize: number;
  message: string;
  createdAt: string;
};
export class PublicRsvpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter: number = 0,
  ) {
    super(code);
  }
}
async function publicRequest<T>(
  slug: string,
  suffix: string,
  body?: RsvpPayload,
  key?: string,
): Promise<T> {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      slug,
    )
  )
    throw new PublicRsvpError(400, 'INVALID_REQUEST');
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new PublicRsvpError(0, 'NETWORK_ERROR');
  let response: Response;
  try {
    response = await fetch(
      base.replace(/\/$/, '') + `/public/invitations/${slug}/${suffix}`,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          Accept: 'application/json',
          ...(body
            ? { 'Content-Type': 'application/json', 'Idempotency-Key': key! }
            : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new PublicRsvpError(0, 'NETWORK_ERROR');
  }
  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    try {
      const problem = (await response.json()) as { code?: unknown };
      if (
        typeof problem.code === 'string' &&
        /^[A-Z_]{1,50}$/.test(problem.code)
      )
        code = problem.code;
    } catch {}
    const raw = Number(response.headers.get('Retry-After'));
    throw new PublicRsvpError(
      response.status,
      code,
      Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 0,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new PublicRsvpError(0, 'NETWORK_ERROR');
  }
}
export const getPublicRsvpState = (slug: string) =>
  publicRequest<RsvpState>(slug, 'rsvp-state');
export const submitPublicRsvp = (
  slug: string,
  key: string,
  payload: RsvpPayload,
) => publicRequest<RsvpReceipt>(slug, 'rsvps', payload, key);
