'use client';
import { bootstrapSession } from '../../identity-access/session/refresh-coordinator';
import { sessionStore } from '../../identity-access/session/store';
import type { TemplateDesign, WeddingData } from '../document/types';

export interface TemplateSummary {
  id: string;
  name: string;
  category: string;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
  sortOrder: number;
  coverUrl: string | null;
  publishedRevisionId: string | null;
  editVersion: number;
  createdAt: string;
  updatedAt: string;
}
export interface TemplateDetail extends TemplateSummary {
  draftDocument: TemplateDesign;
  draftSampleData: WeddingData;
  coverAssetId: string | null;
  createdBy: string;
}
export interface AssetSummary {
  id: string;
  name: string;
  kind: 'IMAGE' | 'DECORATION' | 'BACKGROUND' | 'THUMBNAIL';
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  createdAt: string;
  previewUrl: string;
}
export interface ListPage<T> {
  items: T[];
  nextCursor: string | null;
}
const messages: Record<string, string> = {
  VERSION_CONFLICT:
    'Mẫu đã có phiên bản mới. Bản sửa của bạn vẫn được giữ; tải lại để tiếp tục.',
  ASSET_UNAVAILABLE: 'Ảnh không còn khả dụng hoặc bạn không có quyền sử dụng.',
  DOCUMENT_INVALID: 'Vui lòng kiểm tra các thuộc tính trong thiết kế.',
  STORAGE_UNAVAILABLE:
    'Kho ảnh đang tạm thời không khả dụng. Vui lòng thử lại.',
  UPLOAD_INVALID: 'Ảnh không đúng định dạng hoặc vượt giới hạn cho phép.',
};
export class BuilderApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly issues: { path: string; code: string; nodeId?: string }[] = [],
  ) {
    super(
      messages[code] ??
        (status === 401
          ? 'Vui lòng đăng nhập để tiếp tục.'
          : status === 403
            ? 'Bạn không có quyền thực hiện thao tác này.'
            : 'Không thể hoàn tất yêu cầu. Bản sửa của bạn vẫn được giữ.'),
    );
  }
}
type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  bytes?: boolean;
  idempotencyKey?: string;
};
async function fetchBuilder(
  path: string,
  options: Options,
  token?: string,
): Promise<Response> {
  if (
    !/^\/(?:admin\/templates|admin\/template-assets|assets|templates|invitations|publication-operations)(?:[/?]|$)/.test(
      path,
    ) ||
    /[\\#]/.test(path) ||
    path
      .split('?')[0]
      .split('/')
      .some((part) => part === '..' || part.includes('%'))
  )
    throw new BuilderApiError(400, 'INVALID_REQUEST');
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new BuilderApiError(0, 'NETWORK_ERROR');
  const headers: Record<string, string> = {
    Accept: options.bytes ? 'image/*' : 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined && options.form !== undefined)
    throw new BuilderApiError(400, 'INVALID_REQUEST');
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey)
    headers['Idempotency-Key'] = options.idempotencyKey;
  try {
    return await fetch(base.replace(/\/$/, '') + path, {
      method: options.method ?? 'GET',
      headers,
      body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    throw new BuilderApiError(0, 'NETWORK_ERROR');
  }
}
export async function builderRequest<T>(
  path: string,
  options: Options = {},
): Promise<T> {
  let response = await fetchBuilder(
    path,
    options,
    sessionStore.get()?.accessToken,
  );
  if (response.status === 401) {
    const session = await bootstrapSession();
    if (!session) throw new BuilderApiError(401, 'AUTHENTICATION_REQUIRED');
    response = await fetchBuilder(path, options, session.accessToken);
  }
  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    let issues: BuilderApiError['issues'] = [];
    try {
      const error = (await response.json()) as {
        code?: unknown;
        issues?: unknown;
      };
      if (typeof error.code === 'string' && /^[A-Z_]{1,50}$/.test(error.code))
        code = error.code;
      if (Array.isArray(error.issues))
        issues = error.issues
          .slice(0, 100)
          .filter(
            (issue): issue is BuilderApiError['issues'][number] =>
              !!issue &&
              typeof issue === 'object' &&
              typeof (issue as { path?: unknown }).path === 'string' &&
              typeof (issue as { code?: unknown }).code === 'string',
          );
    } catch {
      /* Status still provides a safe fallback. */
    }
    throw new BuilderApiError(response.status, code, issues);
  }
  if (response.status === 204) return undefined as T;
  return (options.bytes ? await response.blob() : await response.json()) as T;
}
export function scopedAssetPath(url: string): string {
  if (!url.startsWith('/api/v1/'))
    throw new BuilderApiError(400, 'INVALID_REQUEST');
  return url.slice('/api/v1'.length);
}

export async function uploadBuilderAsset(
  file: File,
  name: string,
  kind: Exclude<AssetSummary['kind'], 'THUMBNAIL'>,
  scope: 'template' | 'customer' = 'template',
): Promise<AssetSummary> {
  if (file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new BuilderApiError(422, 'UPLOAD_INVALID');
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('name', name);
  form.append('kind', kind);
  if (scope === 'customer' && kind !== 'IMAGE')
    throw new BuilderApiError(422, 'UPLOAD_INVALID');
  const path = scope === 'template' ? '/admin/template-assets' : '/assets';
  return builderRequest<AssetSummary>(path, { method: 'POST', form });
}
