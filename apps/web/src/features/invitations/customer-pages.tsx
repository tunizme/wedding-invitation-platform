'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '../identity-access/session/store';
import {
  builderRequest,
  BuilderApiError,
  scopedAssetPath,
} from '../invitation-builder/api/client';
import {
  createInvitation,
  listInvitations,
  listTemplateChoices,
  type InvitationSummary,
  type TemplateChoice,
} from './api';

const message = (error: unknown) =>
  error instanceof BuilderApiError
    ? error.message
    : 'Không thể tải dữ liệu. Vui lòng thử lại.';
const useCustomer = () =>
  useSyncExternalStore(sessionStore.subscribe, sessionStore.get, () => null)
    ?.user.role === 'CUSTOMER';

export function CustomerTemplatePicker() {
  const customer = useCustomer(),
    router = useRouter();
  const [choices, setChoices] = useState<TemplateChoice[]>([]),
    [covers, setCovers] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [category, setCategory] = useState(''),
    [tag, setTag] = useState('');
  const [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!customer) return;
    let active = true;
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    if (tag) params.set('tag', tag);
    void listTemplateChoices(params.toString())
      .then((result) => {
        if (active) {
          setChoices(result.items);
          setCursor(result.nextCursor);
        }
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      });
    return () => {
      active = false;
    };
  }, [customer, query, category, tag]);
  useEffect(() => {
    const abort = new AbortController(),
      created: string[] = [];
    let active = true;
    void Promise.all(
      choices.map(async (choice) => {
        try {
          const blob = await builderRequest<Blob>(
            scopedAssetPath(choice.coverUrl),
            { bytes: true, signal: abort.signal },
          );
          if (!active) return [choice.id, ''] as const;
          const url = URL.createObjectURL(blob);
          created.push(url);
          return [choice.id, url] as const;
        } catch {
          return [choice.id, ''] as const;
        }
      }),
    ).then((entries) => {
      if (active) setCovers(Object.fromEntries(entries));
    });
    return () => {
      active = false;
      abort.abort();
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [choices]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ cursor });
      if (query) params.set('q', query);
      if (category) params.set('category', category);
      if (tag) params.set('tag', tag);
      const result = await listTemplateChoices(params.toString());
      setChoices((current) => [
        ...current,
        ...result.items.filter(
          (item) => !current.some((prior) => prior.id === item.id),
        ),
      ]);
      setCursor(result.nextCursor);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function create(choice: TemplateChoice) {
    setBusy(true);
    setError('');
    try {
      const invitation = await createInvitation(
        choice.id,
        choice.publishedRevisionId,
      );
      router.push(`/invitations/${invitation.id}/edit`);
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }
  if (!customer) return <p role="alert">Khu vực này chỉ dành cho Customer.</p>;
  return (
    <section aria-label="Chọn mẫu thiệp">
      <label>
        Tìm mẫu{' '}
        <input
          disabled={busy}
          value={query}
          onChange={(event) => {
            setCursor(null);
            setQuery(event.target.value);
          }}
        />
      </label>
      <label>
        Danh mục{' '}
        <input
          disabled={busy}
          value={category}
          onChange={(event) => {
            setCursor(null);
            setCategory(event.target.value);
          }}
        />
      </label>
      <label>
        Nhãn{' '}
        <input
          disabled={busy}
          value={tag}
          onChange={(event) => {
            setCursor(null);
            setTag(event.target.value);
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <ul>
        {choices.map((choice) => (
          <li key={choice.id}>
            {covers[choice.id] && (
              <Image
                key={covers[choice.id]}
                unoptimized
                src={covers[choice.id]}
                alt=""
                width={120}
                height={160}
              />
            )}
            <strong>{choice.name}</strong> <span>{choice.category}</span>{' '}
            <button disabled={busy} onClick={() => void create(choice)}>
              Chọn mẫu {choice.name}
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <button disabled={busy} onClick={() => void more()}>
          Tải thêm mẫu
        </button>
      )}
    </section>
  );
}

export function CustomerInvitationList() {
  const customer = useCustomer();
  const [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [items, setItems] = useState<InvitationSummary[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (!customer) return;
    let active = true;
    void listInvitations()
      .then((result) => {
        if (active) {
          setItems(result.items);
          setCursor(result.nextCursor);
        }
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      });
    return () => {
      active = false;
    };
  }, [customer]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const result = await listInvitations(
        new URLSearchParams({ cursor }).toString(),
      );
      setItems((current) => [
        ...current,
        ...result.items.filter(
          (item) => !current.some((prior) => prior.id === item.id),
        ),
      ]);
      setCursor(result.nextCursor);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!customer) return <p role="alert">Khu vực này chỉ dành cho Customer.</p>;
  return (
    <section aria-label="Thiệp của tôi">
      <Link href="/templates">Tạo thiệp mới</Link>
      {error && <p role="alert">{error}</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/invitations/${item.id}/edit`}>
              Chỉnh thông tin thiệp
            </Link>{' '}
            · {item.status} ·{' '}
            <Link href={`/invitations/${item.id}/rsvps`}>Phản hồi RSVP</Link>
            {item.publicUrl && (
              <>
                {' '}
                · <Link href={item.publicUrl}>Xem thiệp</Link>
              </>
            )}
          </li>
        ))}
      </ul>
      {cursor && (
        <button disabled={busy} onClick={() => void more()}>
          Tải thêm thiệp
        </button>
      )}
    </section>
  );
}
