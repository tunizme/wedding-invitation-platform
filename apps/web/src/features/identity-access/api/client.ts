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
}

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
  ) {
    super(messages[status] ?? 'Đã có lỗi xảy ra. Vui lòng thử lại sau.');
  }
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
    throw new ApiError(400);
  }
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new ApiError(0);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.accessToken)
    headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.csrfToken) headers['X-CSRF-Token'] = options.csrfToken;
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
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(0);
  }
  if (!response.ok) {
    let code: string | undefined;
    try {
      const problem = (await response.json()) as { code?: unknown };
      if (typeof problem.code === 'string' && problem.code.length <= 80)
        code = problem.code;
    } catch {
      // Status-based safe messaging remains available for non-JSON failures.
    }
    throw new ApiError(response.status, code);
  }
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(0);
  }
}
