'use client';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../identity-access/session/operation-scope';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '../identity-access/session/store';
import {
  builderRequest,
  BuilderApiError,
  scopedAssetPath,
} from '../invitation-builder/api/client';
import {
  listInvitations,
  getInvitation,
  type InvitationDetail,
  listTemplateChoices,
  type InvitationSummary,
  type TemplateChoice,
} from './api';

import type { OperationScope } from '../identity-access/session/operation-scope';
import { Field } from '../../ui/platform/field';
import { Button } from '../../ui/platform/button';
import { InlineAlert, LocalStatus } from '../../ui/platform/feedback';
import { TemplatePopup } from './template-popup';
import { useTemplateCreation } from './template-preview';
import catalogStyles from './template-catalog.module.css';
import workspaceStyles from './customer-workspace.module.css';
import { Mail, ArrowUpRight, Copy } from 'lucide-react';
import { StatusBadge } from '../../ui/platform/feedback';

const message = (error: unknown) =>
  error instanceof BuilderApiError
    ? error.message
    : 'Không thể tải dữ liệu. Vui lòng thử lại.';
const useCustomer = () =>
  useSyncExternalStore(sessionStore.subscribe, sessionStore.get, () => null)
    ?.user.role === 'CUSTOMER';

function OwnedCustomerTemplatePicker() {
  const lifetime = useOperationLifetime('CustomerTemplatePicker');
  const [choices, setChoices] = useState<TemplateChoice[]>([]);
  const [covers, setCovers] = useState<{
    choices: TemplateChoice[];
    urls: Record<string, string>;
  }>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [category, setCategory] = useState(''),
    [tag, setTag] = useState(''),
    [query, setQuery] = useState('');
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [moreBusy, setMoreBusy] = useState(false),
    [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<TemplateChoice | null>(null);
  const trigger = useRef<HTMLElement | null>(null),
    workspace = useRef<HTMLElement | null>(null);
  const queryScope = useRef<OperationScope | null>(null);
  const creation = useTemplateCreation('CustomerTemplateCreate');
  useEffect(() => {
    const scope = lifetime.capture();
    queryScope.current = scope;
    queueMicrotask(() => {
      if (!scope.isActive()) return;
      setChoices([]);
      setCursor(null);
      setError('');
      setLoading(true);
      setMoreBusy(false);
    });
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    if (tag) params.set('tag', tag);
    void listTemplateChoices(params.toString(), { scope })
      .then((result) => {
        if (!scope.isActive()) return;
        setChoices(result.items);
        setCursor(result.nextCursor);
      })
      .catch((cause) => {
        if (scope.isActive()) setError(message(cause));
      })
      .finally(() => {
        if (scope.isActive()) setLoading(false);
      });
    return () => scope.dispose();
  }, [query, category, tag, reload, lifetime]);
  useEffect(() => {
    const scope = lifetime.capture(),
      created: string[] = [];
    scope.onDispose(() => created.forEach((url) => URL.revokeObjectURL(url)));
    void Promise.all(
      choices.map(async (choice) => {
        try {
          const blob = await builderRequest<Blob>(
            scopedAssetPath(choice.coverUrl),
            { bytes: true, scope },
          );
          scope.assertActive();
          const url = URL.createObjectURL(blob);
          created.push(url);
          return [choice.id, url] as const;
        } catch {
          return [choice.id, ''] as const;
        }
      }),
    ).then((entries) => {
      if (scope.isActive())
        setCovers({ choices, urls: Object.fromEntries(entries) });
    });
    return () => scope.dispose();
  }, [choices, lifetime]);
  async function more() {
    const scope = queryScope.current;
    if (!scope?.isActive() || !cursor || moreBusy) return;
    setMoreBusy(true);
    setError('');
    const params = new URLSearchParams({ cursor });
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    if (tag) params.set('tag', tag);
    try {
      const result = await listTemplateChoices(params.toString(), { scope });
      if (!scope.isActive()) return;
      setChoices((current) => [
        ...current,
        ...result.items.filter(
          (item) => !current.some((prior) => prior.id === item.id),
        ),
      ]);
      setCursor(result.nextCursor);
    } catch (cause) {
      if (scope.isActive()) setError(message(cause));
    } finally {
      if (scope.isActive()) setMoreBusy(false);
    }
  }
  function reloadCatalog() {
    queryScope.current?.dispose();
    setSelected(null);
    setChoices([]);
    creation.reload();
    setReload((value) => value + 1);
  }
  function filter(set: (value: string) => void, value: string) {
    queryScope.current?.dispose();
    setChoices([]);
    setCursor(null);
    set(value);
  }
  const urls = covers?.choices === choices ? covers.urls : {};
  return (
    <section
      ref={workspace}
      tabIndex={-1}
      aria-label="Chọn mẫu thiệp"
      className={catalogStyles.catalog}
    >
      <p className={catalogStyles.intro}>
        Tìm một phong cách vừa vặn với câu chuyện của hai bạn.
      </p>
      {choices.length > 0 && (
        <div
          className={catalogStyles.categoryTabs}
          aria-label="Danh mục đã tải"
        >
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => filter(setCategory, '')}
          >
            Tất cả mẫu
          </button>
          {[
            ...new Set(
              choices.map((choice) => choice.category).filter(Boolean),
            ),
          ].map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={category === name}
              onClick={() => filter(setCategory, name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className={catalogStyles.filters}>
        <Field
          id="catalog-search"
          label="Tìm mẫu"
          value={query}
          maxLength={120}
          disabled={creation.busy}
          onChange={(event) => filter(setQuery, event.target.value)}
          placeholder="Tên mẫu bạn yêu thích"
        />
        <Field
          id="catalog-category"
          label="Danh mục"
          value={category}
          maxLength={64}
          disabled={creation.busy}
          onChange={(event) => filter(setCategory, event.target.value)}
          placeholder="Tất cả danh mục"
        />
        <Field
          id="catalog-tag"
          label="Nhãn"
          value={tag}
          maxLength={32}
          disabled={creation.busy}
          onChange={(event) => filter(setTag, event.target.value)}
          placeholder="Tìm theo nhãn"
        />
      </div>
      {error && (
        <InlineAlert tone="error">
          {error}
          <p>
            <Button variant="secondary" onClick={reloadCatalog}>
              Tải lại kho mẫu
            </Button>
          </p>
        </InlineAlert>
      )}
      {loading ? (
        <LocalStatus tone="neutral">Đang tải mẫu thiệp…</LocalStatus>
      ) : !choices.length && !error ? (
        <div className={catalogStyles.empty}>
          <h2>Chưa tìm thấy mẫu phù hợp</h2>
          <p>Thử một tên, danh mục hoặc nhãn khác nhé.</p>
        </div>
      ) : null}
      <ul className={catalogStyles.grid}>
        {choices.map((choice) => (
          <li key={choice.id}>
            <button
              type="button"
              className={catalogStyles.card}
              aria-label={`Xem mẫu ${choice.name}`}
              disabled={creation.busy}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setSelected(choice);
              }}
            >
              <div className={catalogStyles.cover}>
                {urls[choice.id] ? (
                  <Image
                    key={urls[choice.id]}
                    unoptimized
                    src={urls[choice.id]}
                    alt=""
                    width={320}
                    height={400}
                  />
                ) : (
                  <span>Ảnh bìa chưa sẵn sàng</span>
                )}
              </div>
              <div className={catalogStyles.cardText}>
                <h2>{choice.name}</h2>
                <span>{choice.category}</span>
                <span className={catalogStyles.cardAction}>Khám phá mẫu →</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <div className={catalogStyles.loadMore}>
          <Button
            variant="secondary"
            disabled={moreBusy || creation.busy}
            onClick={() => void more()}
          >
            {moreBusy ? 'Đang tải thêm…' : 'Tải thêm mẫu'}
          </Button>
        </div>
      )}
      {selected && (
        <TemplatePopup
          key={`${selected.id}:${selected.publishedRevisionId}`}
          choice={selected}
          onClose={() => setSelected(null)}
          onReload={reloadCatalog}
          returnFocusRef={trigger}
          fallbackFocusRef={workspace}
          creation={creation}
        />
      )}
    </section>
  );
}

function OwnedCustomerInvitationList({
  overview = false,
}: {
  overview?: boolean;
}) {
  const lifetime = useOperationLifetime('CustomerInvitationList');
  const customer = useCustomer();
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  const [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [items, setItems] = useState<InvitationSummary[]>([]),
    [error, setError] = useState('');
  const detailCache = useRef(new Map<string, InvitationDetail>());
  const [presentation, setPresentation] = useState<{
    key: string;
    rows: Record<string, { title: string; template: string; cover?: string }>;
  }>({ key: '', rows: {} });
  const [shareStatus, setShareStatus] = useState('');
  const hydrationKey = items
    .slice(0, 12)
    .map((item) => `${item.id}:${item.editVersion}`)
    .join('|');
  useEffect(() => {
    if (!hydrationKey) return;
    const scope = lifetime.capture();
    const rows: Record<
      string,
      { title: string; template: string; cover?: string }
    > = {};
    const created: string[] = [];
    scope.onDispose(() => created.forEach((url) => URL.revokeObjectURL(url)));
    const queue = hydrationKey.split('|');
    async function worker() {
      while (queue.length && scope.isActive()) {
        const key = queue.shift()!;
        const id = key.split(':')[0];
        try {
          const detail =
            detailCache.current.get(key) ??
            (await getInvitation(id, { scope }));
          if (!scope.isActive() || detail.id !== id || !detail.draftWeddingData)
            continue;
          detailCache.current.set(key, detail);
          while (detailCache.current.size > 24)
            detailCache.current.delete(
              detailCache.current.keys().next().value!,
            );
          const data = detail.draftWeddingData;
          const title =
            [data.bride?.name, data.groom?.name].filter(Boolean).join(' & ') ||
            'Thiệp của bạn';
          const row: { title: string; template: string; cover?: string } = {
            title,
            template: detail.templateName,
          };
          const asset =
            data.couple?.photo || data.bride?.photo || data.groom?.photo;
          if (asset) {
            try {
              let blob: Blob;
              try {
                blob = await builderRequest<Blob>(`/assets/${asset}/content`, {
                  scope,
                  bytes: true,
                });
              } catch {
                scope.assertActive();
                blob = await builderRequest<Blob>(
                  `/templates/${detail.templateId}/revisions/${detail.designRevisionId}/assets/${asset}`,
                  { scope, bytes: true },
                );
              }
              scope.assertActive();
              row.cover = URL.createObjectURL(blob);
              created.push(row.cover);
            } catch {
              /* An unavailable photo does not hide invitation data. */
            }
          }
          if (scope.isActive()) rows[id] = row;
        } catch {
          /* Summary remains useful when its extra detail is unavailable. */
        }
      }
    }
    void Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, () => worker()),
    ).then(() => {
      if (scope.isActive()) setPresentation({ key: hydrationKey, rows });
    });
    return () => scope.dispose();
  }, [hydrationKey, lifetime]);
  const hydrated = presentation.key === hydrationKey ? presentation.rows : {};
  async function copyLink(publicUrl: string) {
    const scope = lifetime.capture();
    try {
      await navigator.clipboard.writeText(
        new URL(publicUrl, window.location.origin).href,
      );
      if (scope.isActive()) setShareStatus('Đã sao chép liên kết thiệp.');
    } catch {
      if (scope.isActive())
        setShareStatus(
          'Không thể sao chép. Mở thiệp và sao chép địa chỉ trên trình duyệt.',
        );
    } finally {
      scope.dispose();
    }
  }
  const currentScope = useRef<OperationScope | null>(null);
  useEffect(() => {
    if (!customer) return;
    const scope = lifetime.capture();
    currentScope.current = scope;
    queueMicrotask(() => {
      if (!scope.isActive()) return;
      setLoading(true);
      setError('');
      setBusy(false);
    });
    void listInvitations('', { scope })
      .then((result) => {
        if (!scope.isActive()) return;
        setItems(result.items);
        setCursor(result.nextCursor);
      })
      .catch((cause) => {
        if (scope.isActive()) setError(message(cause));
      })
      .finally(() => {
        if (scope.isActive()) setLoading(false);
      });
    return () => scope.dispose();
  }, [customer, lifetime, attempt]);
  async function more() {
    const scope = currentScope.current;
    if (!scope?.isActive() || !cursor || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await listInvitations(
        new URLSearchParams({ cursor }).toString(),
        { scope },
      );
      if (!scope.isActive()) return;
      setItems((current) => [
        ...current,
        ...result.items.filter(
          (item) => !current.some((prior) => prior.id === item.id),
        ),
      ]);
      setCursor(result.nextCursor);
    } catch (cause) {
      if (scope.isActive()) setError(message(cause));
    } finally {
      if (scope.isActive()) setBusy(false);
    }
  }
  if (!customer) return <p role="alert">Khu vực này chỉ dành cho Customer.</p>;
  const counts = {
    published: items.filter((item) => item.status === 'PUBLISHED').length,
    draft: items.filter((item) => item.status === 'DRAFT').length,
    paused: items.filter((item) => item.status === 'UNPUBLISHED').length,
  };
  return (
    <section
      aria-label={overview ? 'Tổng quan thiệp của bạn' : 'Thiệp của bạn'}
      className={workspaceStyles.list}
    >
      {overview && (
        <div className={workspaceStyles.welcome}>
          <div>
            <span className={workspaceStyles.eyebrow}>KHÔNG GIAN CỦA BẠN</span>
            <h2>Chào {session?.user.displayName || 'bạn'},</h2>
            <p>Mỗi lời mời là một câu chuyện. Mình tiếp tục chăm chút nhé.</p>
          </div>
          <Link href="/templates">
            Tạo thiệp mới <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
      )}
      {shareStatus && <LocalStatus tone="neutral">{shareStatus}</LocalStatus>}
      {loading && (
        <LocalStatus tone="neutral">Đang tải thiệp của bạn…</LocalStatus>
      )}
      {error && (
        <InlineAlert tone="error">
          {error}
          <p>
            <Button
              variant="secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Tải lại danh sách
            </Button>
          </p>
        </InlineAlert>
      )}
      {overview && !loading && !error && (
        <>
          <p className={workspaceStyles.scope}>
            Thống kê trong {items.length} thiệp đã tải
            {cursor ? ' · Còn thiệp ở trang tiếp theo' : ''}.
          </p>
          <div className={workspaceStyles.stats}>
            {[
              ['Đang xuất bản', counts.published],
              ['Bản nháp', counts.draft],
              ['Đã tạm dừng', counts.paused],
            ].map(([label, count]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <h2 className={workspaceStyles.sectionTitle}>
            Tiếp tục chăm chút lời mời
          </h2>
        </>
      )}
      {!loading && !error && !items.length && (
        <div className={workspaceStyles.empty}>
          <h2>Chưa có thiệp nào</h2>
          <p>
            Bắt đầu từ một mẫu bạn yêu thích để gửi lời thương của riêng mình.
          </p>
          <Link href="/templates">Khám phá mẫu thiệp →</Link>
        </div>
      )}
      <ul className={workspaceStyles.cards}>
        {items.map((item) => (
          <li key={item.id}>
            {hydrated[item.id]?.cover && (
              <Image
                src={hydrated[item.id].cover!}
                alt=""
                width={480}
                height={180}
                unoptimized
                className={workspaceStyles.cover}
              />
            )}
            <div className={workspaceStyles.cardTop}>
              <span className={workspaceStyles.monogram} aria-hidden="true">
                <Mail size={22} strokeWidth={1.75} />
              </span>
              <StatusBadge
                tone={item.status === 'PUBLISHED' ? 'success' : 'neutral'}
              >
                {item.status === 'PUBLISHED'
                  ? 'Đã xuất bản'
                  : item.status === 'DRAFT'
                    ? 'Bản nháp'
                    : 'Đã ngừng xuất bản'}
              </StatusBadge>
            </div>
            <h2>{hydrated[item.id]?.title || 'Thiệp của bạn'}</h2>
            {hydrated[item.id]?.template && (
              <p className={workspaceStyles.updated}>
                Mẫu · {hydrated[item.id].template}
              </p>
            )}
            <p className={workspaceStyles.identifier}>Mã thiệp · {item.id}</p>
            {item.updatedAt && (
              <p className={workspaceStyles.updated}>
                Cập nhật{' '}
                {new Intl.DateTimeFormat('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                }).format(new Date(item.updatedAt))}
              </p>
            )}
            <div className={workspaceStyles.cardLinks}>
              <Link href={`/invitations/${item.id}/edit`}>
                Chỉnh thông tin thiệp
              </Link>
              <Link href={`/invitations/${item.id}/rsvps`}>Quản lý RSVP</Link>
              {item.publicUrl && (
                <>
                  <Link href={item.publicUrl}>Xem thiệp</Link>
                  <button
                    type="button"
                    onClick={() => void copyLink(item.publicUrl!)}
                  >
                    <Copy size={14} aria-hidden="true" /> Sao chép liên kết
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <div className={workspaceStyles.more}>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void more()}
          >
            {busy ? 'Đang tải thêm…' : 'Tải thêm thiệp'}
          </Button>
        </div>
      )}
    </section>
  );
}

export function CustomerTemplatePicker() {
  const owner = usePrivateOwner('CustomerTemplatePicker', 'CUSTOMER');
  return owner ? (
    <OwnedCustomerTemplatePicker key={owner} />
  ) : (
    <p role="alert">Khu vực này chỉ dành cho CUSTOMER.</p>
  );
}

export function CustomerInvitationList({
  overview = false,
}: {
  overview?: boolean;
}) {
  const owner = usePrivateOwner('CustomerInvitationList', 'CUSTOMER');
  return owner ? (
    <OwnedCustomerInvitationList key={owner} overview={overview} />
  ) : (
    <p role="alert">Khu vực này chỉ dành cho CUSTOMER.</p>
  );
}
