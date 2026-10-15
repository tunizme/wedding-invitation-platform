'use client';
import { validateSupportedTemplateDesign } from '../document/schema';
import { bootstrapSession } from '../../identity-access/session/refresh-coordinator';
import { sessionStore } from '../../identity-access/session/store';
import {
  withSignal,
  combinedDeadline,
  createOperationScope,
  type OperationScope,
} from '../../identity-access/session/operation-scope';
import type {
  SupportedTemplateDesign,
  WeddingData,
  ValidationIssue,
} from '../document/types';

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
  resourceKind?: 'INVITATION';
  paidAt?: string | null;
  draftDocument: SupportedTemplateDesign;
  draftSampleData: WeddingData;
  coverAssetId: string | null;
  createdBy: string;
}
export interface AssetSummary {
  id: string;
  name: string;
  kind: 'IMAGE' | 'DECORATION' | 'BACKGROUND' | 'THUMBNAIL' | 'AUDIO';
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  category?: string | null;
  durationMs?: number | null;
  createdAt: string;
  previewUrl: string;
}
export interface ListPage<T> {
  items: T[];
  nextCursor: string | null;
}
const messages: Record<string, string> = {
  TEMPLATE_NOT_DRAFT: 'Chỉ có thể xóa mẫu bản nháp chưa từng xuất bản.',
  PAYMENT_REQUIRED: 'Cần xác nhận đã thanh toán trước khi xuất bản thiệp.',
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
    readonly issues: ValidationIssue[] = [],
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
export type Options = {
  scope?: OperationScope;
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
    !/^\/(?:admin\/customers|admin\/templates|admin\/template-assets|admin\/template-audio|admin\/editor-presets|admin\/invitations|assets|templates|invitations|publication-operations)(?:[/?]|$)/.test(
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
      body:
        options.form ??
        (options.body === undefined ? undefined : JSON.stringify(options.body)),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: options.signal,
    });
  } catch {
    throw new BuilderApiError(0, 'NETWORK_ERROR');
  }
}
export async function builderRequest<T>(
  path: string,
  options: Options = {},
): Promise<T> {
  const scope = options.scope ?? createOperationScope(path);
  const deadline = combinedDeadline(options.signal, 15000);
  const abort = () => deadlineController.abort();
  const deadlineController = new AbortController();
  const forwardDeadline = () => deadlineController.abort();
  if (scope.signal.aborted || deadline.signal.aborted)
    deadlineController.abort();
  scope.signal.addEventListener('abort', abort, { once: true });
  deadline.signal.addEventListener('abort', forwardDeadline, { once: true });
  const check = () => {
    if (!scope.isActive()) throw new BuilderApiError(409, 'SUPERSEDED');
    if (deadlineController.signal.aborted)
      throw new BuilderApiError(0, 'REQUEST_CANCELLED');
  };
  const transport = { ...options, signal: deadlineController.signal };
  try {
    check();
    const current = sessionStore.get();
    let response = await withSignal(
      () => fetchBuilder(path, transport, current?.accessToken),
      deadlineController.signal,
    );
    check();
    if (response.status === 401) {
      if (!current) throw new BuilderApiError(401, 'AUTHENTICATION_REQUIRED');
      const session = await withSignal(
        () => bootstrapSession(),
        deadlineController.signal,
      );
      check();
      if (!session) throw new BuilderApiError(401, 'AUTHENTICATION_REQUIRED');
      response = await withSignal(
        () => fetchBuilder(path, transport, session.accessToken),
        deadlineController.signal,
      );
      check();
    }
    if (!response.ok) {
      let code = 'REQUEST_FAILED';
      let issues: BuilderApiError['issues'] = [];
      try {
        const error = (await withSignal(
          () => response.json(),
          deadlineController.signal,
        )) as {
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
        /* Preserve safe status fallback after body admission. */
      }
      check();
      throw new BuilderApiError(response.status, code, issues);
    }
    if (response.status === 204) return undefined as T;
    const value = (
      options.bytes
        ? await withSignal(() => response.blob(), deadlineController.signal)
        : await withSignal(() => response.json(), deadlineController.signal)
    ) as T;
    check();
    if (!options.bytes && value && typeof value === 'object') {
      for (const key of ['draftDocument', 'document'] as const)
        if (key in value) {
          const checked = validateSupportedTemplateDesign(
            (value as Record<string, unknown>)[key],
          );
          if (!checked.valid)
            throw new BuilderApiError(422, checked.code, checked.issues);
        }
    }
    return value;
  } catch (error) {
    check();
    throw error;
  } finally {
    deadline.dispose();
    scope.signal.removeEventListener('abort', abort);
    deadline.signal.removeEventListener('abort', forwardDeadline);
    if (!options.scope) scope.dispose();
  }
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
  options: Pick<Options, 'signal' | 'scope'> & { invitationId?: string } = {},
): Promise<AssetSummary> {
  if (
    file.size > (kind === 'AUDIO' ? 20 : 10) * 1024 * 1024 ||
    !(
      kind === 'AUDIO'
        ? ['audio/mpeg']
        : ['image/jpeg', 'image/png', 'image/webp']
    ).includes(file.type)
  )
    throw new BuilderApiError(422, 'UPLOAD_INVALID');
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('name', name);
  form.append('kind', kind);
  if (scope === 'customer' && !['IMAGE', 'AUDIO'].includes(kind))
    throw new BuilderApiError(422, 'UPLOAD_INVALID');
  const path = options.invitationId
    ? `/admin/invitations/${options.invitationId}/${kind === 'AUDIO' ? 'audio' : 'assets'}`
    : kind === 'AUDIO'
      ? scope === 'template'
        ? '/admin/template-audio'
        : '/assets/audio'
      : scope === 'template'
        ? '/admin/template-assets'
        : '/assets';
  return builderRequest<AssetSummary>(path, {
    ...options,
    method: 'POST',
    form,
  });
}
