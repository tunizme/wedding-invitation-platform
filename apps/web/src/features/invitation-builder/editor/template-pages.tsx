'use client';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../../identity-access/session/operation-scope';
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
const SectionEditor = dynamic(() => import('./section-editor'), {
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
  async function duplicate(template: TemplateSummary) {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    if (duplicating.current) return;
    const name = window.prompt('Tên bản sao', template.name + ' (bản sao)');
    if (!name) return;
    duplicating.current = true;
    setLoading(true);
    const generation = currentRequest.current.generation;
    try {
      await builderRequest(`/admin/templates/${template.id}/duplicate`, {
        scope,
        method: 'POST',
        body: { expectedVersion: template.editVersion, name },
      });
      if (!scope.isActive()) return;
      load(currentRequest.current.query);
    } catch (cause) {
      if (!scope.isActive()) return;
      if (currentRequest.current.generation === generation)
        setError(message(cause));
    } finally {
      if (!scope.isActive()) return;
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
function OwnedNewTemplate() {
  const lifetime = useOperationLifetime('NewTemplate');
  const admin = useAdmin(),
    router = useRouter(),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const data = new FormData(event.currentTarget);
    try {
      const value = await builderRequest<TemplateDetail>('/admin/templates', {
        scope,
        method: 'POST',
        body: {
          name: data.get('name'),
          category: data.get('category'),
          ...(data.get('schemaVersion') === '2' ? { schemaVersion: 2 } : {}),
        },
      });
      if (!scope.isActive()) return;
      router.push(`/admin/templates/${value.id}/edit`);
    } catch (cause) {
      if (!scope.isActive()) return;
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
      <label>
        Kiểu thiết kế
        <select name="schemaVersion" defaultValue="1">
          <option value="1">Canvas cũ</option>
          <option value="2">Sections responsive</option>
        </select>
      </label>
      <button disabled={saving}>Tạo mẫu</button>
      {error && <p role="alert">{error}</p>}
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
  return (
    <>
      <h1>{template.name}</h1>
      {template.draftDocument.schemaVersion === 2 ? (
        <SectionEditor initial={template} onSaved={setTemplate} />
      ) : (
        <TemplateEditor initial={template} onSaved={setTemplate} />
      )}
    </>
  );
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
