'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  builderRequest,
  type ListPage,
  type TemplateDetail,
  type TemplateSummary,
} from '../invitation-builder/api/client';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../identity-access/session/operation-scope';
import InvitationEditor from '../invitation-builder/editor/invitation-editor';
import { Button } from '../../ui/platform/button';
import { Field, SelectField } from '../../ui/platform/field';
import { InlineAlert } from '../../ui/platform/feedback';
import type { InvitationSummary } from './api';
import { parseGuestCsv, type GuestInput } from './guest-csv';
import { formatVietnameseTimestamp } from './event-local-time';
import { invitationFeatureVisibility } from './feature-visibility';
import styles from './service-pages.module.css';

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
type ManagedInvitation = InvitationSummary & {
  ownerId: string;
  customerEmail: string;
};
export function AdminInvitations() {
  const owner = usePrivateOwner('AdminInvitations', 'ADMIN');
  return owner ? <OwnedAdminInvitations key={owner} /> : null;
}
function OwnedAdminInvitations() {
  const lifetime = useOperationLifetime('AdminInvitations');
  const [items, setItems] = useState<ManagedInvitation[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [email, setEmail] = useState(''),
    [title, setTitle] = useState(''),
    [templateId, setTemplateId] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const submitting = useRef(false);
  useEffect(() => {
    const scope = lifetime.capture();
    void Promise.all([
      builderRequest<ListPage<ManagedInvitation>>('/admin/invitations', {
        scope,
      }),
      builderRequest<ListPage<TemplateSummary>>(
        '/admin/templates?limit=100&status=PUBLISHED',
        { scope },
      ),
    ])
      .then(([page, choices]) => {
        if (scope.isActive()) {
          setItems(page.items);
          setCursor(page.nextCursor);
          setTemplates(choices.items);
        }
      })
      .catch((cause) => {
        if (scope.isActive()) setError(message(cause));
      })
      .finally(() => {
        if (scope.isActive()) setLoading(false);
      });
    return () => scope.dispose();
  }, [lifetime]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const scope = lifetime.capture();
    try {
      const customer = await builderRequest<{
        id: string;
        invitationQueued: boolean;
      }>('/admin/customers/invite', { scope, method: 'POST', body: { email } });
      const invitation = await builderRequest<ManagedInvitation>(
        '/admin/invitations',
        {
          scope,
          method: 'POST',
          body: { customerId: customer.id, templateId, title },
        },
      );
      if (scope.isActive()) {
        setItems((prior) => [
          { ...invitation, customerEmail: email.trim().toLowerCase() },
          ...prior,
        ]);
        setTitle('');
        setNotice(
          customer.invitationQueued
            ? 'Đã tạo thiệp. Email kích hoạt đang được gửi đến khách.'
            : 'Đã tạo thiệp cho tài khoản customer hiện có.',
        );
      }
    } catch (cause) {
      if (scope.isActive()) setError(message(cause));
    } finally {
      submitting.current = false;
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    const scope = lifetime.capture();
    try {
      const page = await builderRequest<ListPage<ManagedInvitation>>(
        `/admin/invitations?cursor=${encodeURIComponent(cursor)}`,
        { scope },
      );
      if (scope.isActive()) {
        setItems((prior) => [...prior, ...page.items]);
        setCursor(page.nextCursor);
      }
    } catch (cause) {
      if (scope.isActive()) setError(message(cause));
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <h1>Thiệp khách hàng</h1>
          <p>Thiết kế riêng, xác nhận thanh toán và bàn giao link thiệp.</p>
        </div>
        <Link href="/admin/templates">Quản lý kho mẫu</Link>
      </header>
      <section className={styles.panel}>
        <h2>Tạo thiệp cho khách</h2>
        <form className={styles.form} onSubmit={create}>
          <Field
            id="customer-email"
            label="Email customer"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <Field
            id="invitation-title"
            label="Tên thiệp"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
          <SelectField
            id="source-template"
            label="Mẫu đã xuất bản"
            required
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={busy}
          >
            <option value="">Chọn mẫu</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectField>
          <Button type="submit" busy={busy} disabled={!templates.length}>
            Tạo thiệp riêng
          </Button>
        </form>
        <p className={styles.meta}>
          Khách mới nhận email kích hoạt và tự đặt mật khẩu. Thiệp được tạo từ
          bản sao mẫu, có thể chỉnh toàn bộ bố cục riêng.
        </p>
      </section>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p role="status">Đang tải thiệp…</p>
      ) : !items.length ? (
        <p>Chưa có thiệp khách hàng.</p>
      ) : (
        <ul className={styles.cards}>
          {items.map((item) => (
            <li className={styles.card} key={item.id}>
              <h2>{item.title || 'Thiệp khách hàng'}</h2>
              <p>{item.customerEmail}</p>
              <p className={styles.meta}>
                {item.status === 'PUBLISHED'
                  ? 'Đang công khai'
                  : item.status === 'UNPUBLISHED'
                    ? 'Đã gỡ xuất bản'
                    : 'Bản nháp'}{' '}
                · {item.paidAt ? 'Đã thanh toán' : 'Chưa thanh toán'}
              </p>
              <div className={styles.actions}>
                <Link href={`/admin/invitations/${item.id}/edit`}>
                  Thiết kế thiệp
                </Link>
                <Link href={`/admin/invitations/${item.id}/manage`}>
                  Thanh toán và bàn giao
                </Link>
                <Link href={`/admin/invitations/${item.id}/guests`}>
                  Khách mời
                </Link>
                {invitationFeatureVisibility.wishes && (
                  <Link href={`/admin/invitations/${item.id}/wishes`}>
                    Lời chúc
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button variant="secondary" busy={busy} onClick={() => void more()}>
          Tải thêm
        </Button>
      )}
    </main>
  );
}
export function AdminInvitationEditor({ id }: { id: string }) {
  const owner = usePrivateOwner(`AdminInvitationEditor:${id}`, 'ADMIN');
  return owner ? <OwnedAdminInvitationEditor key={owner} id={id} /> : null;
}
function OwnedAdminInvitationEditor({ id }: { id: string }) {
  const lifetime = useOperationLifetime(`AdminInvitationEditor:${id}`),
    [detail, setDetail] = useState<TemplateDetail | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const scope = lifetime.capture();
    void builderRequest<TemplateDetail>(`/admin/invitations/${id}`, { scope })
      .then((value) => {
        if (value.resourceKind !== 'INVITATION' || !value.draftDocument)
          throw new Error(
            'Thiệp này thuộc luồng điền thông tin cũ. Hãy mở từ danh sách thiệp khách hàng.',
          );
        if (scope.isActive()) setDetail(value);
      })
      .catch((cause) => {
        if (scope.isActive()) setError(message(cause));
      });
    return () => scope.dispose();
  }, [id, lifetime]);
  if (error) return <InlineAlert tone="error">{error}</InlineAlert>;
  if (!detail) return <p role="status">Đang tải thiết kế thiệp…</p>;
  return <InvitationEditor initial={detail} onSaved={setDetail} />;
}
export function ManageServiceInvitation({ id }: { id: string }) {
  const owner = usePrivateOwner(`ManageServiceInvitation:${id}`, 'ADMIN');
  return owner ? <OwnedManageServiceInvitation key={owner} id={id} /> : null;
}
function OwnedManageServiceInvitation({ id }: { id: string }) {
  const lifetime = useOperationLifetime(id),
    [detail, setDetail] = useState<InvitationSummary | null>(null),
    [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const scope = lifetime.capture();
    void builderRequest<InvitationSummary>(`/admin/invitations/${id}`, {
      scope,
    })
      .then((value) => {
        if (scope.isActive()) setDetail(value);
      })
      .catch((cause) => {
        if (scope.isActive()) setError(message(cause));
      });
    return () => scope.dispose();
  }, [id, lifetime]);
  async function paid(event: FormEvent) {
    event.preventDefault();
    if (!detail || busy) return;
    setBusy(true);
    setError('');
    const scope = lifetime.capture();
    try {
      const value = await builderRequest<InvitationSummary>(
        `/admin/invitations/${id}/payment`,
        {
          scope,
          method: 'POST',
          body: { expectedVersion: detail.editVersion, note },
        },
      );
      if (scope.isActive()) {
        setDetail(value);
        setNotice('Đã xác nhận thanh toán. Có thể xuất bản trong editor.');
      }
    } catch (cause) {
      if (scope.isActive()) setError(message(cause));
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Đã sao chép liên kết.');
    } catch {
      setError(
        'Không sao chép được. Bạn có thể mở liên kết và sao chép trên thanh địa chỉ.',
      );
    }
  }
  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <h1>{detail?.title || 'Thanh toán và bàn giao'}</h1>
          <p>Xác nhận thanh toán bên ngoài trước khi xuất bản thiệp.</p>
        </div>
        <Link href="/admin/invitations">Danh sách thiệp</Link>
      </header>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {notice && <p role="status">{notice}</p>}
      {!detail ? (
        <p role="status">Đang tải…</p>
      ) : (
        <>
          <section className={styles.panel}>
            <h2>{detail.paidAt ? 'Đã thanh toán' : 'Chưa thanh toán'}</h2>
            {detail.paidAt ? (
              <p>
                Đã xác nhận {formatVietnameseTimestamp(detail.paidAt)}.{' '}
                {detail.paymentNote}
              </p>
            ) : (
              <form className={styles.form} onSubmit={paid}>
                <Field
                  id="payment-note"
                  label="Ghi chú thanh toán"
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                />
                <Button type="submit" busy={busy}>
                  Xác nhận đã nhận đủ tiền
                </Button>
              </form>
            )}
          </section>
          <section className={styles.panel}>
            <h2>Bàn giao thiệp</h2>
            <div className={styles.actions}>
              <Link href={`/admin/invitations/${id}/edit`}>
                Mở editor và xuất bản
              </Link>
              <Link href={`/admin/invitations/${id}/guests`}>
                Quản lý khách mời
              </Link>
              {invitationFeatureVisibility.wishes && (
                <Link href={`/admin/invitations/${id}/wishes`}>
                  Quản lý lời chúc
                </Link>
              )}
            </div>
            {detail.status === 'PUBLISHED' && detail.publicUrl ? (
              <div className={styles.actions}>
                <Link href={detail.publicUrl} target="_blank" rel="noreferrer">
                  Xem thiệp công khai
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => void copy(location.origin + detail.publicUrl)}
                >
                  Sao chép link thiệp
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void copy(`${location.origin}/invitations/${id}/guests`)
                  }
                >
                  Sao chép link quản lý cho customer
                </Button>
              </div>
            ) : (
              <p>
                Thiệp chưa công khai. Hoàn tất thiết kế, xác nhận thanh toán rồi
                xuất bản để bàn giao.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

type Guest = {
  id: string;
  name: string;
  group: string;
  publicUrl: string | null;
  revoked: boolean;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  attendance: 'ATTENDING' | 'DECLINED' | null;
  partySize: number | null;
};
type GuestPage = ListPage<Guest> & {
  totals: {
    guests: number;
    opened: number;
    attending: number;
    declined: number;
  };
};
export function InvitationGuests({
  id,
  assisted = false,
}: {
  id: string;
  assisted?: boolean;
}) {
  const owner = usePrivateOwner(
    `InvitationGuests:${id}`,
    assisted ? 'ADMIN' : 'CUSTOMER',
  );
  return owner ? (
    <OwnedInvitationGuests key={owner} id={id} assisted={assisted} />
  ) : null;
}
function OwnedInvitationGuests({
  id,
  assisted,
}: {
  id: string;
  assisted: boolean;
}) {
  const lifetime = useOperationLifetime(id),
    base = `/${assisted ? 'admin/' : ''}invitations/${id}`;
  const [page, setPage] = useState<GuestPage | null>(null),
    [name, setName] = useState(''),
    [group, setGroup] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useRef<{ key: string; guests: GuestInput[] } | null>(null),
    fileRef = useRef<HTMLInputElement>(null),
    sending = useRef(false);
  useEffect(() => {
    const scope = lifetime.capture();
    void builderRequest<GuestPage>(`${base}/guests?limit=100`, { scope })
      .then((value) => {
        if (scope.isActive()) setPage(value);
      })
      .catch((cause) => {
        if (scope.isActive()) setError(message(cause));
      });
    return () => scope.dispose();
  }, [base, lifetime]);
  async function add(guests: GuestInput[]) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    const scope = lifetime.capture();
    if (
      !pending.current ||
      JSON.stringify(pending.current.guests) !== JSON.stringify(guests)
    )
      pending.current = { key: crypto.randomUUID(), guests };
    try {
      await builderRequest(`${base}/guests/import`, {
        scope,
        method: 'POST',
        body: { guests: pending.current.guests },
        idempotencyKey: pending.current.key,
      });
      pending.current = null;
      const next = await builderRequest<GuestPage>(`${base}/guests?limit=100`, {
        scope,
      });
      if (scope.isActive()) {
        setPage(next);
        setName('');
        setGroup('');
        setNotice(`Đã thêm ${guests.length} khách mời.`);
      }
    } catch (cause) {
      if (scope.isActive()) setError(message(cause));
    } finally {
      sending.current = false;
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function change(guest: Guest, action: 'rotate' | 'revoke') {
    if (
      busy ||
      !window.confirm(
        action === 'rotate'
          ? 'Tạo link mới? Link cũ của khách này sẽ ngừng hoạt động.'
          : 'Thu hồi link riêng của khách này?',
      )
    )
      return;
    setBusy(true);
    const scope = lifetime.capture();
    try {
      await builderRequest(`${base}/guests/${guest.id}/${action}`, {
        scope,
        method: 'POST',
      });
      const next = await builderRequest<GuestPage>(`${base}/guests?limit=100`, {
        scope,
      });
      if (scope.isActive()) {
        setPage(next);
        setNotice(
          action === 'rotate' ? 'Đã tạo link mới.' : 'Đã thu hồi link.',
        );
      }
    } catch (cause) {
      if (scope.isActive()) setError(message(cause));
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function more() {
    if (!page?.nextCursor || busy) return;
    setBusy(true);
    const scope = lifetime.capture();
    try {
      const next = await builderRequest<GuestPage>(
        `${base}/guests?limit=100&cursor=${encodeURIComponent(page.nextCursor)}`,
        { scope },
      );
      if (scope.isActive())
        setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (cause) {
      if (scope.isActive()) setError(message(cause));
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <h1>Khách mời</h1>
          <p>Link riêng, lượt mở và phản hồi tham dự của từng khách.</p>
        </div>
        <Link href={assisted ? '/admin/invitations' : '/invitations'}>
          Danh sách thiệp
        </Link>
      </header>
      <div className={styles.actions}>
        {(!assisted || invitationFeatureVisibility.wishes) && (
          <Link
            href={
              assisted
                ? `/admin/invitations/${id}/wishes`
                : `/invitations/${id}/interactions`
            }
          >
            {invitationFeatureVisibility.wishes
              ? 'Lời chúc và tương tác'
              : 'Phản hồi biểu mẫu'}
          </Link>
        )}
        <Link href={`/${assisted ? 'admin/' : ''}invitations/${id}/rsvps`}>
          Tất cả RSVP
        </Link>
      </div>
      {page && (
        <section className={styles.stats} aria-label="Thống kê khách mời">
          {[
            [page.totals.guests, 'Khách mời'],
            [page.totals.opened, 'Link đã được mở'],
            [page.totals.attending, 'Sẽ tham dự'],
            [page.totals.declined, 'Không tham dự'],
          ].map(([value, label]) => (
            <div key={label} className={styles.stat}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
      )}
      <section className={styles.panel}>
        <h2>Thêm khách mời</h2>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void add([{ name: name.trim(), group: group.trim() }]);
          }}
        >
          <Field
            id="guest-name"
            label="Tên khách mời"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <Field
            id="guest-group"
            label="Nhóm"
            maxLength={120}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            disabled={busy}
          />
          <Button type="submit" busy={busy}>
            Thêm khách
          </Button>
        </form>
        <Field
          ref={fileRef}
          id="guest-csv"
          label="Nhập danh sách CSV"
          helper="UTF-8, tiêu đề name,group. Tối đa 1.000 khách mỗi lần; tên trùng vẫn là khách riêng."
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void file
              .text()
              .then((text) => add(parseGuestCsv(text)))
              .catch((cause) => setError(message(cause)))
              .finally(() => {
                if (fileRef.current) fileRef.current.value = '';
              });
          }}
        />
      </section>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {notice && <p role="status">{notice}</p>}
      <section className={styles.panel}>
        <h2>Danh sách khách</h2>
        <p className={styles.meta}>
          Link có thể được chuyển tiếp. Lượt mở không xác minh danh tính người
          xem. Chỉ sao chép được link khi thiệp đã xuất bản.
        </p>
        {!page ? (
          <p role="status">Đang tải…</p>
        ) : !page.items.length ? (
          <p>Chưa có khách mời.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Khách mời</th>
                  <th>Lượt mở link</th>
                  <th>RSVP</th>
                  <th>Link riêng</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((guest) => (
                  <tr key={guest.id}>
                    <td data-label="Khách mời">
                      <strong>{guest.name}</strong>
                      <div className={styles.meta}>{guest.group}</div>
                    </td>
                    <td data-label="Lượt mở link">
                      {guest.openCount}
                      {guest.lastOpenedAt && (
                        <div className={styles.meta}>
                          Gần nhất:{' '}
                          {formatVietnameseTimestamp(guest.lastOpenedAt)}
                        </div>
                      )}
                    </td>
                    <td data-label="RSVP">
                      {guest.attendance === 'ATTENDING'
                        ? `Tham dự · ${guest.partySize} người`
                        : guest.attendance === 'DECLINED'
                          ? 'Không tham dự'
                          : 'Chưa phản hồi'}
                    </td>
                    <td data-label="Link riêng">
                      <div className={styles.actions}>
                        {guest.publicUrl && (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              void navigator.clipboard
                                .writeText(location.origin + guest.publicUrl)
                                .then(() =>
                                  setNotice(
                                    `Đã sao chép link cho ${guest.name}.`,
                                  ),
                                )
                                .catch(() =>
                                  setError('Không sao chép được liên kết.'),
                                );
                            }}
                          >
                            Sao chép
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void change(guest, 'rotate')}
                        >
                          Tạo link mới
                        </Button>
                        {!guest.revoked && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void change(guest, 'revoke')}
                          >
                            Thu hồi
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page?.nextCursor && (
          <Button variant="secondary" busy={busy} onClick={() => void more()}>
            Tải thêm khách
          </Button>
        )}
      </section>
    </main>
  );
}
