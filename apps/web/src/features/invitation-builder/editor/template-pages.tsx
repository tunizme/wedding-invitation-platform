'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
const TemplateEditor = dynamic(() => import('./template-editor'), {
  ssr: false,
  loading: () => <p>Đang tải trình thiết kế…</p>,
});
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
export function TemplateList() {
  const admin = useAdmin();
  const [page, setPage] = useState<ListPage<TemplateSummary> | null>(null);
  const [error, setError] = useState('');
  const [request, setRequest] = useState({ query: '', generation: 0 });
  const currentRequest = useRef(request);
  const pending = useRef(true);
  const duplicating = useRef(false);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
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
    const abort = new AbortController();
    const ownsRequest = () =>
      !abort.signal.aborted &&
      currentRequest.current.generation === request.generation;
    void builderRequest<ListPage<TemplateSummary>>(
      '/admin/templates?' + request.query,
      { signal: abort.signal },
    )
      .then((value) => {
        if (ownsRequest()) setPage(value);
      })
      .catch((cause) => {
        if (ownsRequest()) setError(message(cause));
      })
      .finally(() => {
        if (ownsRequest()) {
          pending.current = false;
          setListLoading(false);
        }
      });
    return () => abort.abort();
  }, [admin, request]);
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
  async function duplicate(template: TemplateSummary) {
    if (duplicating.current) return;
    const name = window.prompt('Tên bản sao', template.name + ' (bản sao)');
    if (!name) return;
    duplicating.current = true;
    setLoading(true);
    const generation = currentRequest.current.generation;
    try {
      await builderRequest(`/admin/templates/${template.id}/duplicate`, {
        method: 'POST',
        body: { expectedVersion: template.editVersion, name },
      });
      load(currentRequest.current.query);
    } catch (cause) {
      if (currentRequest.current.generation === generation)
        setError(message(cause));
    } finally {
      duplicating.current = false;
      setLoading(false);
    }
  }
  if (!admin) return <p role="alert">Khu vực này chỉ dành cho Admin.</p>;
  return (
    <>
      <Link href="/admin/templates/new">Tạo mẫu mới</Link>
      <form onSubmit={search}>
        {[
          ['q', 'Tìm mẫu'],
          ['category', 'Danh mục'],
          ['tag', 'Nhãn'],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input name={name} />
          </label>
        ))}
        <label>
          Trạng thái
          <select name="status">
            <option value="">Tất cả</option>
            {['DRAFT', 'PUBLISHED', 'UNPUBLISHED'].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <button>Tìm kiếm</button>
      </form>
      {listLoading && <p role="status">Đang tải danh sách mẫu…</p>}
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            disabled={listLoading}
            onClick={() => load(currentRequest.current.query)}
          >
            Thử tải lại danh sách
          </button>
        </>
      )}
      <ul>
        {page?.items.map((template) => (
          <li key={template.id}>
            <Link href={`/admin/templates/${template.id}/edit`}>
              {template.name}
            </Link>{' '}
            — {template.category} · {template.status}{' '}
            <button disabled={loading} onClick={() => void duplicate(template)}>
              Nhân bản {template.name}
            </button>
          </li>
        ))}
      </ul>
      {page?.nextCursor && (
        <button
          onClick={() => {
            if (pending.current) return;
            const params = new URLSearchParams(currentRequest.current.query);
            params.set('cursor', page.nextCursor!);
            load(params.toString());
          }}
        >
          Trang tiếp
        </button>
      )}
    </>
  );
}
export function NewTemplate() {
  const admin = useAdmin(),
    router = useRouter(),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const data = new FormData(event.currentTarget);
    try {
      const value = await builderRequest<TemplateDetail>('/admin/templates', {
        method: 'POST',
        body: { name: data.get('name'), category: data.get('category') },
      });
      router.push(`/admin/templates/${value.id}/edit`);
    } catch (cause) {
      setError(message(cause));
      setSaving(false);
    }
  }
  if (!admin) return <p role="alert">Khu vực này chỉ dành cho Admin.</p>;
  return (
    <form onSubmit={(event) => void create(event)}>
      <label>
        Tên mẫu
        <input name="name" required maxLength={120} />
      </label>
      <label>
        Danh mục
        <input name="category" required maxLength={64} defaultValue="Wedding" />
      </label>
      <button disabled={saving}>Tạo mẫu</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function EditTemplate({ id }: { id: string }) {
  const admin = useAdmin(),
    [template, setTemplate] = useState<TemplateDetail | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!admin) return;
    let live = true;
    void builderRequest<TemplateDetail>(`/admin/templates/${id}`)
      .then((value) => {
        if (live) setTemplate(value);
      })
      .catch((cause) => {
        if (live) setError(message(cause));
      });
    return () => {
      live = false;
    };
  }, [id, admin]);
  if (!admin) return <p role="alert">Khu vực này chỉ dành cho Admin.</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!template) return <p>Đang tải mẫu…</p>;
  return (
    <>
      <h1>{template.name}</h1>
      <TemplateEditor initial={template} onSaved={setTemplate} />
    </>
  );
}
