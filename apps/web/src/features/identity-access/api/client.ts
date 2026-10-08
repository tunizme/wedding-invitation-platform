export type UserRole = 'CUSTOMER' | 'ADMIN';
export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  loginMethod: 'LOCAL' | 'GOOGLE' | 'FACEBOOK';
  role: UserRole;
  status: 'ACTIVE' | 'LOCKED';
  displayName: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
}
export interface AccessSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: 900;
  csrfToken: string;
  user: UserProfile;
  /** 006 CSP-1 metadata; present on every protocol-2 session response. */
  authProtocol?: 2;
  sessionTag?: string;
  contextRevision?: number;
}

/**
 * 006 client operation knowledge (research R06). COMPLETED means a response
 * was parsed — it is not success. UNCERTAIN means the request may have reached
 * the server: never auto-replay it.
 */
export type OperationKnowledge = 'NOT_DISPATCHED' | 'COMPLETED' | 'UNCERTAIN';

/** Default dispatched-request deadline (R06). */
export const REQUEST_DEADLINE_MS = 15_000;

const messages: Record<number, string> = {
  0: 'Không thể kết nối máy chủ. Vui lòng thử lại.',
  400: 'Yêu cầu không hợp lệ hoặc đã hết hạn.',
  401: 'Vui lòng đăng nhập để tiếp tục.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  409: 'Không thể hoàn tất yêu cầu. Vui lòng dùng phương thức đăng nhập đã đăng ký.',
  422: 'Vui lòng kiểm tra thông tin đã nhập.',
  429: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    public readonly knowledge: OperationKnowledge = 'COMPLETED',
    public readonly currentRevision?: number,
  ) {
    super(messages[status] ?? 'Đã có lỗi xảy ra. Vui lòng thử lại sau.');
  }
}

export interface AuthHeaders {
  contextId?: string;
  intentId?: string;
  sessionTag?: string | null;
}

export async function iamRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    accessToken?: string;
    csrfToken?: string;
    cookieAuth?: boolean;
    signal?: AbortSignal;
    /** 006 context/intent/session headers (contracts/auth-context.openapi.yaml). */
    auth?: AuthHeaders;
    /** Reject 2xx JSON bodies without authProtocol = 2 (browser-state §8). */
    expectProtocol?: boolean;
  } = {},
): Promise<T> {
  // Relative routes only: credentials must never follow caller-controlled origins or redirects.
  if (
    !/^\/(auth\/|me(?:$|\/)|admin\/customers(?:$|[/?]))/.test(path) ||
    /[\\#]/.test(path) ||
    path
      .split('?')[0]
      .split('/')
      .some((part) => part === '..' || /%/i.test(part))
  ) {
    throw new ApiError(400, undefined, 'NOT_DISPATCHED');
  }
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new ApiError(0, undefined, 'NOT_DISPATCHED');
  if (options.signal?.aborted)
    throw new ApiError(0, undefined, 'NOT_DISPATCHED');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.accessToken)
    headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.csrfToken) headers['X-CSRF-Token'] = options.csrfToken;
  if (options.auth?.contextId)
    headers['X-Auth-Context'] = options.auth.contextId;
  if (options.auth?.intentId) headers['X-Auth-Intent'] = options.auth.intentId;
  if (options.auth?.sessionTag)
    headers['X-Auth-Session-Tag'] = options.auth.sessionTag;
  // The caller signal is combined with, never a replacement for, the deadline.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), REQUEST_DEADLINE_MS);
  const forward = () => deadline.abort();
  options.signal?.addEventListener('abort', forward, { once: true });
  try {
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: options.cookieAuth ? 'include' : 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: deadline.signal,
      });
    } catch {
      throw new ApiError(0, undefined, 'UNCERTAIN');
    }
    if (!response.ok) {
      let code: string | undefined;
      let currentRevision: number | undefined;
      try {
        const problem = (await response.json()) as {
          code?: unknown;
          currentRevision?: unknown;
        };
        if (typeof problem.code === 'string' && problem.code.length <= 80)
          code = problem.code;
        if (Number.isSafeInteger(problem.currentRevision))
          currentRevision = problem.currentRevision as number;
      } catch {
        // Status still provides safe messaging, but unreadable bodies do not confirm an outcome.
        throw new ApiError(response.status, undefined, 'UNCERTAIN');
      }
      throw new ApiError(response.status, code, 'COMPLETED', currentRevision);
    }
    if (response.status === 204) return undefined as T;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Headers (and any Set-Cookie) already arrived: the server may have committed.
      throw new ApiError(0, undefined, 'UNCERTAIN');
    }
    if (
      options.expectProtocol &&
      (!body ||
        typeof body !== 'object' ||
        (body as { authProtocol?: unknown }).authProtocol !== 2)
    )
      throw new ApiError(0, 'PROTOCOL_MISMATCH', 'COMPLETED');
    return body as T;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', forward);
  }
}
