'use client';
import InvitationEditor from './invitation-editor';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../../identity-access/session/operation-scope';
import Link from 'next/link';
import Image from 'next/image';
import {
  Copy,
  Image as ImageIcon,
  Plus,
  ArrowRight,
  Pencil,
} from 'lucide-react';
import { Button } from '../../../ui/platform/button';
import { Field, SelectField } from '../../../ui/platform/field';
import {
  InlineAlert,
  LocalStatus,
  StatusBadge,
} from '../../../ui/platform/feedback';
import { ModalSurface } from '../../../ui/platform/modal-surface';
import styles from './template-pages.module.css';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { sessionStore } from '../../identity-access/session/store';
import {
  builderRequest,
  BuilderApiError,
  type TemplateDetail,
  type TemplateSummary,
  type ListPage,
} from '../api/client';
function useAdmin() {
  return (
    useSyncExternalStore(sessionStore.subscribe, sessionStore.get, () => null)
      ?.user.role === 'ADMIN'
  );
}
const message = (error: unknown) =>
  error instanceof BuilderApiError
    ? error.message
    : 'Không thể tải mẫu. Vui lòng thử lại.';
function OwnedTemplateList() {
  const lifetime = useOperationLifetime('TemplateList');
  const admin = useAdmin();
  const [page, setPage] = useState<ListPage<TemplateSummary> | null>(null);
  const [error, setError] = useState('');
  const [request, setRequest] = useState({ query: '', generation: 0 });
  const currentRequest = useRef(request);
  const pending = useRef(true);
  const duplicating = useRef(false);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [copy, setCopy] = useState<TemplateSummary | null>(null);
  const [copyName, setCopyName] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copyUncertain, setCopyUncertain] = useState(false);
  const [coverState, setCovers] = useState<{
    page: ListPage<TemplateSummary> | null;
    urls: Record<string, string>;
  }>({ page: null, urls: {} });
  const covers = coverState.page === page ? coverState.urls : {};
  const workspace = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scope = lifetime.capture(),
      urls: string[] = [];
    scope.onDispose(() => urls.forEach((url) => URL.revokeObjectURL(url)));
    void Promise.all(
      (page?.items ?? [])
        .filter(
          (item) =>
            item.coverUrl &&
            new RegExp('^/api/v1/templates/' + item.id + '/cover$').test(
              item.coverUrl,
            ),
        )
        .map(async (item) => {
          try {
            const blob = await builderRequest<Blob>(
              item.coverUrl!.replace(/^\/api\/v1/, ''),
              { scope, bytes: true },
            );
            scope.assertActive();
            const url = URL.createObjectURL(blob);
            urls.push(url);
            return [item.id, url] as const;
          } catch {
            return null;
          }
        }),
    ).then((items) => {
      if (scope.isActive())
        setCovers({
          page,
          urls: Object.fromEntries(items.filter((item) => item !== null)),
        });
    });
    return () => scope.dispose();
  }, [page, lifetime]);
  function load(query: string) {
    const next = { query, generation: currentRequest.current.generation + 1 };
    currentRequest.current = next;
    pending.current = true;
    setPage(null);
    setError('');
    setListLoading(true);
    setRequest(next);
  }
  useEffect(() => {
    if (!admin) return;
    const scope = lifetime.capture();
    const ownsRequest = () =>
      scope.isActive() &&
      currentRequest.current.generation === request.generation;
    void builderRequest<ListPage<TemplateSummary>>(
      '/admin/templates?' + request.query,
      { scope },
    )
      .then((value) => {
        if (!lifetime.isActive()) return;
        if (ownsRequest()) setPage(value);
      })
      .catch((cause) => {
        if (!lifetime.isActive()) return;
        if (ownsRequest()) setError(message(cause));
      })
      .finally(() => {
        if (ownsRequest()) {
          pending.current = false;
          setListLoading(false);
        }
      });
    return () => scope.dispose();
  }, [admin, request, lifetime]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      params = new URLSearchParams();
    for (const key of ['q', 'category', 'tag', 'status']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) params.set(key, value);
    }
    load(params.toString());
  }
  async function duplicate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!copy || duplicating.current || copyUncertain) return;
    const name = copyName.trim();
    if (!name || name.length > 120) {
      setCopyError('Nhập tên bản sao từ 1 đến 120 ký tự.');
      return;
    }
    const scope = lifetime.capture();
    if (!scope.isActive()) return;
    duplicating.current = true;
    setLoading(true);
    setCopyError('');
    try {
      await builderRequest(`/admin/templates/${copy.id}/duplicate`, {
        scope,
        method: 'POST',
        body: { expectedVersion: copy.editVersion, name },
      });
      if (!scope.isActive()) return;
      setCopy(null);
      load(currentRequest.current.query);
    } catch (cause) {
      if (!scope.isActive()) return;
      const uncertain =
        cause instanceof BuilderApiError &&
        (cause.status === 0 || cause.status >= 500);
      setCopyUncertain(uncertain);
      setCopyError(
        uncertain
          ? 'Chưa xác định kết quả nhân bản. Kiểm tra danh sách mẫu trước khi tạo bản sao khác.'
          : message(cause),
      );
    } finally {
      if (scope.isActive()) {
        duplicating.current = false;
        setLoading(false);
      }
      scope.dispose();
    }
  }
  if (!admin) return <p role="alert">Khu vực này chỉ dành cho Admin.</p>;
  return (
    <div className={styles.workspace} ref={workspace} tabIndex={-1}>
      <div className={styles.listAction}>
        <Link className={styles.primaryLink} href="/admin/templates/new">
          <Plus size={18} aria-hidden="true" />
          Tạo mẫu mới
        </Link>
      </div>
      <form onSubmit={search} className={styles.filters}>
        {(
          [
            ['q', 'Tìm mẫu', 120],
            ['category', 'Danh mục', 64],
            ['tag', 'Nhãn', 32],
          ] as const
        ).map(([name, label, limit]) => (
          <Field
            key={name}
            id={`admin-filter-${name}`}
            label={label}
            name={name}
            maxLength={limit}
          />
        ))}
        <SelectField id="admin-filter-status" label="Trạng thái" name="status">
          <option value="">Tất cả</option>
          {['DRAFT', 'PUBLISHED', 'UNPUBLISHED'].map((status) => (
            <option key={status} value={status}>
              {status === 'DRAFT'
                ? 'Bản nháp'
                : status === 'PUBLISHED'
                  ? 'Đã xuất bản'
                  : 'Đã ngừng xuất bản'}
            </option>
          ))}
        </SelectField>
        <Button type="submit">Tìm kiếm</Button>
      </form>
      {listLoading && (
        <LocalStatus tone="neutral">Đang tải danh sách mẫu…</LocalStatus>
      )}
      {error && (
        <InlineAlert tone="error">
          {error}
          <Button
            variant="secondary"
            disabled={listLoading}
            onClick={() => load(currentRequest.current.query)}
          >
            Thử tải lại danh sách
          </Button>
        </InlineAlert>
      )}
      {copyUncertain && !copy && (
        <InlineAlert tone="warning">
          Chưa xác định kết quả nhân bản. Kiểm tra danh sách mẫu trước khi tạo
          bản sao khác.
          <Button
            variant="secondary"
            onClick={() => load(currentRequest.current.query)}
          >
            Kiểm tra danh sách mẫu
          </Button>
        </InlineAlert>
      )}
      {!listLoading && !error && page?.items.length === 0 && (
        <div className={styles.empty}>
          <ImageIcon size={28} aria-hidden="true" />
          <h2>Chưa có mẫu phù hợp</h2>
          <p>Thử thay đổi bộ lọc hoặc tạo một bản nháp mới.</p>
          <Button variant="secondary" onClick={() => load('')}>
            Xem tất cả mẫu
          </Button>
        </div>
      )}
      <ul className={styles.cards}>
        {page?.items.map((template) => (
          <li key={template.id} className={styles.card}>
            <div className={styles.cover}>
              {covers[template.id] ? (
                <Image
                  unoptimized
                  width={400}
                  height={500}
                  src={covers[template.id]}
                  alt={`Ảnh bìa ${template.name}`}
                />
              ) : (
                <div className={styles.noCover}>
                  <ImageIcon size={28} aria-hidden="true" />
                  <span>Chưa có ảnh bìa khả dụng</span>
                </div>
              )}
            </div>
            <div className={styles.cardBody}>
              <StatusBadge
                tone={template.status === 'PUBLISHED' ? 'success' : 'neutral'}
              >
                {template.status === 'PUBLISHED'
                  ? 'Đã xuất bản'
                  : template.status === 'UNPUBLISHED'
                    ? 'Đã ngừng xuất bản'
                    : 'Bản nháp'}
              </StatusBadge>
              <h2>
                <Link href={`/admin/templates/${template.id}/edit`}>
                  {template.name}
                </Link>
              </h2>
              <p>{template.category}</p>
              <div className={styles.tags}>
                {template.tags?.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <Link
                className={styles.editLink}
                href={`/admin/templates/${template.id}/edit`}
                aria-label={`Chỉnh sửa ${template.name}`}
              >
                <Pencil size={16} aria-hidden="true" />
                Chỉnh sửa mẫu
              </Link>
              <Button
                variant="secondary"
                disabled={loading || copyUncertain}
                onClick={() => {
                  setCopy(template);
                  setCopyName(template.name.slice(0, 109) + ' (bản sao)');
                  setCopyError('');
                }}
              >
                <Copy size={16} aria-hidden="true" />
                Nhân bản {template.name}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {page?.nextCursor && (
        <Button
          variant="secondary"
          disabled={listLoading}
          onClick={() => {
            if (pending.current) return;
            const params = new URLSearchParams(currentRequest.current.query);
            params.set('cursor', page.nextCursor!);
            load(params.toString());
          }}
        >
          Trang tiếp
        </Button>
      )}
      {copy && (
        <ModalSurface
          label={`Nhân bản ${copy.name}`}
          variant="centered"
          fallbackFocusRef={workspace}
          onClose={() => setCopy(null)}
        >
          <form
            className={styles.copyForm}
            onSubmit={(event) => void duplicate(event)}
          >
            <p>
              Bản sao là bản nháp riêng, giữ thiết kế và nội dung mẫu hiện tại.
            </p>
            <Field
              id="copy-template-name"
              label="Tên bản sao"
              value={copyName}
              onChange={(event) => setCopyName(event.target.value)}
              required
              maxLength={120}
              disabled={loading || copyUncertain}
            />
            {copyError && <InlineAlert tone="error">{copyError}</InlineAlert>}
            <div className={styles.actions}>
              <Button type="submit" disabled={loading || copyUncertain}>
                Nhân bản mẫu
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCopy(null);
                  load(currentRequest.current.query);
                }}
              >
                Kiểm tra danh sách mẫu
              </Button>
            </div>
          </form>
        </ModalSurface>
      )}
    </div>
  );
}

function OwnedNewTemplate() {
  const lifetime = useOperationLifetime('NewTemplate');
  const admin = useAdmin(),
    router = useRouter();
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [name, setName] = useState(''),
    [category, setCategory] = useState('Wedding');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    category?: string;
  }>({});
  const inFlight = useRef(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || uncertain) return;
    const errors = {
      name: !name.trim() ? 'Nhập tên mẫu để tiếp tục.' : undefined,
      category: !category.trim() ? 'Nhập danh mục để tiếp tục.' : undefined,
    };
    setFieldErrors(errors);
    if (errors.name || errors.category) return;
    const scope = lifetime.capture();
    if (!scope.isActive()) return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const value = await builderRequest<TemplateDetail>('/admin/templates', {
        scope,
        method: 'POST',
        body: {
          name: name.trim(),
          category: category.trim(),
        },
      });
      if (!scope.isActive()) return;
      router.push(`/admin/templates/${value.id}/edit`);
    } catch (cause) {
      if (!scope.isActive()) return;
      const unknown =
        cause instanceof BuilderApiError &&
        (cause.status === 0 || cause.status >= 500);
      setUncertain(unknown);
      setError(
        unknown
          ? 'Chưa xác định kết quả tạo mẫu. Kiểm tra danh sách mẫu trước khi tạo lại.'
          : message(cause),
      );
      inFlight.current = false;
      setSaving(false);
    } finally {
      scope.dispose();
    }
  }
  if (!admin) return <p role="alert">Khu vực này chỉ dành cho Admin.</p>;
  return (
    <form
      className={styles.createForm}
      onSubmit={(event) => void create(event)}
    >
      <p className={styles.step}>BƯỚC 1 · CHUẨN BỊ MẪU</p>
      <fieldset disabled={saving || uncertain} className={styles.metadata}>
        <legend>Thông tin mẫu</legend>
        <Field
          id="new-template-name"
          name="name"
          label="Tên mẫu"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
          helper="Tên hiển thị trong kho mẫu của tiệm."
        />
        <Field
          id="new-template-category"
          name="category"
          label="Danh mục"
          required
          maxLength={64}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          error={fieldErrors.category}
        />
        <p className={styles.schemaInfo}>
          Thiết kế thiệp trên canvas 500px, tự co theo màn hình điện thoại và
          căn giữa trên desktop.
        </p>
      </fieldset>
      <div className={styles.nextStep}>
        <ArrowRight size={20} aria-hidden="true" />
        <p>
          Sau khi tạo bản nháp, bạn sẽ thêm nội dung, hình ảnh và thiết kế trong
          trình chỉnh sửa. Mẫu chỉ xuất hiện cho khách hàng sau khi xuất bản.
        </p>
      </div>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <div className={styles.actions}>
        <Button type="submit" disabled={saving || uncertain}>
          {saving ? 'Đang tạo mẫu…' : 'Tạo mẫu'}
        </Button>
        <Link href="/admin/templates">
          {uncertain ? 'Kiểm tra danh sách mẫu' : 'Quay lại danh sách mẫu'}
        </Link>
      </div>
    </form>
  );
}
function OwnedEditTemplate({ id }: { id: string }) {
  const lifetime = useOperationLifetime(`EditTemplate:${id}`);
  const admin = useAdmin(),
    [template, setTemplate] = useState<TemplateDetail | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!admin) return;
    const scope = lifetime.capture();
    void builderRequest<TemplateDetail>(`/admin/templates/${id}`, { scope })
      .then((value) => {
        if (!lifetime.isActive()) return;
        if (scope.isActive()) setTemplate(value);
      })
      .catch((cause) => {
        if (!lifetime.isActive()) return;
        if (scope.isActive()) setError(message(cause));
      });
    return () => {
      scope.dispose();
    };
  }, [id, admin, lifetime]);
  if (!admin) return <p role="alert">Khu vực này chỉ dành cho Admin.</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!template) return <p>Đang tải mẫu…</p>;
  return <InvitationEditor initial={template} onSaved={setTemplate} />;
}

export function TemplateList() {
  const owner = usePrivateOwner('TemplateList', 'ADMIN');
  return owner ? (
    <OwnedTemplateList key={owner} />
  ) : (
    <p role="alert">Khu vực này chỉ dành cho Admin.</p>
  );
}

export function NewTemplate() {
  const owner = usePrivateOwner('NewTemplate', 'ADMIN');
  return owner ? (
    <OwnedNewTemplate key={owner} />
  ) : (
    <p role="alert">Khu vực này chỉ dành cho Admin.</p>
  );
}

export function EditTemplate({ id }: { id: string }) {
  const owner = usePrivateOwner(`EditTemplate:${id}`, 'ADMIN');
  return owner ? (
    <OwnedEditTemplate key={owner} id={id} />
  ) : (
    <p role="alert">Khu vực này chỉ dành cho Admin.</p>
  );
}
