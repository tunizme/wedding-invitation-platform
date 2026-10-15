'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../identity-access/session/operation-scope';
import {
  builderRequest,
  type ListPage,
} from '../invitation-builder/api/client';
import { Button } from '../../ui/platform/button';
import { InlineAlert } from '../../ui/platform/feedback';
import type { CustomField } from '../invitation-builder/document/editor-document';
import { formatVietnameseTimestamp } from './event-local-time';
import styles from './service-pages.module.css';
import { invitationFeatureVisibility } from './feature-visibility';

type Wish = {
  id: string;
  name: string;
  message: string;
  status: 'PENDING' | 'APPROVED' | 'HIDDEN';
  createdAt: string;
};
type Answer = {
  id: string;
  nodeId: string;
  publicVersion: number;
  fields: CustomField[];
  answers: Record<string, unknown>;
  createdAt: string;
};
export function InvitationInteractions({
  id,
  assisted = false,
}: {
  id: string;
  assisted?: boolean;
}) {
  const owner = usePrivateOwner(
    `Interactions:${id}`,
    assisted ? 'ADMIN' : 'CUSTOMER',
  );
  return owner ? (
    <OwnedInteractions key={owner} id={id} assisted={assisted} />
  ) : (
    <p role="alert">Đăng nhập với quyền quản lý thiệp để tiếp tục.</p>
  );
}
function OwnedInteractions({
  id,
  assisted,
}: {
  id: string;
  assisted: boolean;
}) {
  const lifetime = useOperationLifetime(`Interactions:${id}`),
    [tab, setTab] = useState<'wishes' | 'form-responses'>(
      assisted || invitationFeatureVisibility.wishes
        ? 'wishes'
        : 'form-responses',
    ),
    [wishes, setWishes] = useState<Wish[]>([]),
    [answers, setAnswers] = useState<Answer[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const path = assisted ? `/admin/invitations/${id}` : `/invitations/${id}`;
  const load = useCallback(
    async (append = false, next?: string | null) => {
      const scope = lifetime.capture();
      if (assisted && tab === 'form-responses') return;
      try {
        const page = await builderRequest<ListPage<Wish | Answer>>(
          `${path}/${tab}${next ? '?cursor=' + encodeURIComponent(next) : ''}`,
          { scope },
        );
        if (!scope.isActive()) return;
        if (tab === 'wishes')
          setWishes((a) =>
            append ? [...a, ...(page.items as Wish[])] : (page.items as Wish[]),
          );
        else
          setAnswers((a) =>
            append
              ? [...a, ...(page.items as Answer[])]
              : (page.items as Answer[]),
          );
        setCursor(page.nextCursor);
        setError('');
      } catch (c) {
        if (scope.isActive())
          setError(c instanceof Error ? c.message : 'Không tải được phản hồi');
      } finally {
        scope.dispose();
      }
    },
    [path, tab, assisted, lifetime],
  );
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed && lifetime.isActive()) void load();
    });
    return () => {
      disposed = true;
    };
  }, [load, lifetime]);
  const moderate = async (wish: Wish, status: 'APPROVED' | 'HIDDEN') => {
    if (busy) return;
    const scope = lifetime.capture();
    setBusy(true);
    try {
      await builderRequest(`${path}/wishes/${wish.id}`, {
        scope,
        method: 'PATCH',
        body: { status },
      });
      if (scope.isActive())
        setWishes((items) =>
          items.map((i) => (i.id === wish.id ? { ...i, status } : i)),
        );
    } catch (c) {
      if (scope.isActive())
        setError(c instanceof Error ? c.message : 'Không duyệt được');
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  };
  return (
    <section aria-label="Tương tác thiệp">
      <nav aria-label="Loại phản hồi" className={styles.actions}>
        {invitationFeatureVisibility.wishes && (
          <Button
            variant="secondary"
            aria-pressed={tab === 'wishes'}
            onClick={() => setTab('wishes')}
          >
            Lời chúc
          </Button>
        )}
        {!assisted && (
          <Button
            variant="secondary"
            aria-pressed={tab === 'form-responses'}
            onClick={() => setTab('form-responses')}
          >
            Phản hồi biểu mẫu
          </Button>
        )}
      </nav>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {tab === 'wishes'
        ? wishes.map((w) => (
            <article key={w.id}>
              <h3>{w.name}</h3>
              <p>{w.message}</p>
              <p>
                {w.status === 'PENDING'
                  ? 'Chờ duyệt'
                  : w.status === 'APPROVED'
                    ? 'Đã công khai'
                    : 'Đã ẩn'}{' '}
                · {formatVietnameseTimestamp(w.createdAt)}
              </p>
              <Button
                disabled={busy || w.status === 'APPROVED'}
                onClick={() => void moderate(w, 'APPROVED')}
              >
                Duyệt
              </Button>
              <Button
                variant="secondary"
                disabled={busy || w.status === 'HIDDEN'}
                onClick={() => void moderate(w, 'HIDDEN')}
              >
                Ẩn
              </Button>
            </article>
          ))
        : answers.map((a) => (
            <article key={a.id}>
              <h3>Phản hồi · {formatVietnameseTimestamp(a.createdAt)}</h3>
              <dl>
                {a.fields.map((f) => (
                  <div key={f.id}>
                    <dt>{f.label}</dt>
                    <dd>
                      {Array.isArray(a.answers[f.id])
                        ? (a.answers[f.id] as string[]).join(', ')
                        : String(a.answers[f.id] ?? '—')}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
      {cursor && (
        <Button variant="secondary" onClick={() => void load(true, cursor)}>
          Xem thêm
        </Button>
      )}
      {!error && (tab === 'wishes' ? !wishes.length : !answers.length) && (
        <p>Chưa có phản hồi.</p>
      )}
    </section>
  );
}
