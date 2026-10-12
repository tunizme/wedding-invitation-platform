'use client';

import { Button } from '../../../ui/platform/button';
import { Field, SelectField } from '../../../ui/platform/field';
import {
  InlineAlert,
  LocalStatus,
  StatusBadge,
} from '../../../ui/platform/feedback';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../session/operation-scope';

import Link from 'next/link';
import { ModalSurface } from '../../../ui/platform/modal-surface';
import styles from './customer-management.module.css';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { ApiError, type UserProfile } from '../api/client';
import { authenticatedRequest } from '../session/refresh-coordinator';
import { sessionStore } from '../session/store';

export interface AdminCustomer extends UserProfile {
  role: 'CUSTOMER';
  createdAt: string;
  updatedAt: string;
}
interface CustomerPage {
  items: AdminCustomer[];
  page: { hasMore: boolean; nextCursor: string | null };
}

const message = (cause: unknown, fallback: string) =>
  cause instanceof ApiError ? cause.message : fallback;

function OwnedAdminCustomerList() {
  const lifetime = useOperationLifetime('AdminCustomerList');
  const [selected, setSelected] = useState<string | null>(null);
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState<CustomerPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session?.user.role !== 'ADMIN') return;
    let active = true;
    const params = new URLSearchParams({ limit: '20' });
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (cursor) params.set('cursor', cursor);
    const scope = lifetime.capture();
    void authenticatedRequest<CustomerPage>(`/admin/customers?${params}`, {
      scope,
    })
      .then((value) => {
        if (!lifetime.isActive()) return;
        if (active && lifetime.isActive()) setPage(value);
      })
      .catch((cause: unknown) => {
        if (!lifetime.isActive()) return;
        if (active && lifetime.isActive())
          setError(message(cause, 'Không thể tải danh sách Customer.'));
      })
      .finally(() => {
        if (active && lifetime.isActive()) setLoading(false);
      });
    return () => {
      active = false;
      scope.dispose();
    };
  }, [cursor, filters, session?.user.role, lifetime]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    // Old results belong to the previous filter: never show them next to a
    // failed load for the new one.
    setPage(null);
    setCursor(null);
    setFilters({
      q: String(form.get('q') ?? '').trim(),
      status: String(form.get('status') ?? ''),
    });
  }

  function nextPage(nextCursor: string) {
    setLoading(true);
    setError('');
    setCursor(nextCursor);
  }

  if (session?.user.role !== 'ADMIN')
    return (
      <InlineAlert tone="error">Khu vực này chỉ dành cho Admin.</InlineAlert>
    );

  return (
    <section aria-labelledby="customer-list-heading" className={styles.list}>
      <h2 id="customer-list-heading">Danh sách Customer</h2>
      <form onSubmit={search} className={styles.filters}>
        <Field
          id="customer-search"
          label="Tìm kiếm"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
        />
        <SelectField
          id="customer-status"
          label="Trạng thái"
          name="status"
          defaultValue={filters.status}
        >
          <option value="">Tất cả</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="LOCKED">LOCKED</option>
        </SelectField>
        <Button type="submit" busy={loading}>
          Tìm
        </Button>
      </form>
      {loading && <LocalStatus tone="info">Đang tải…</LocalStatus>}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {!loading && !error && page?.items.length === 0 ? (
        <p>Không có Customer phù hợp.</p>
      ) : null}
      {page?.items.length ? (
        <ul className={styles.rows}>
          {page.items.map((customer) => (
            <li key={customer.id}>
              <div className={styles.identity}>
                <strong>{customer.displayName || 'Khách hàng'}</strong>
                <Link href={`/admin/customers/${customer.id}`}>
                  {customer.email}
                </Link>
              </div>
              <time className={styles.date} dateTime={customer.createdAt}>
                {new Date(customer.createdAt).toLocaleDateString('vi-VN')}
              </time>
              <StatusBadge
                tone={customer.status === 'ACTIVE' ? 'success' : 'warning'}
              >
                {customer.status}
              </StatusBadge>
              <Button
                variant="secondary"
                onClick={() => setSelected(customer.id)}
              >
                Xem hồ sơ
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected && (
        <ModalSurface
          label="Hồ sơ khách hàng"
          onClose={() => setSelected(null)}
        >
          <AdminCustomerDetail key={selected} customerId={selected} />
        </ModalSurface>
      )}
      {page?.page.hasMore && page.page.nextCursor ? (
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          onClick={() => nextPage(page.page.nextCursor!)}
        >
          Trang tiếp
        </Button>
      ) : null}
    </section>
  );
}

function OwnedAdminCustomerDetail({ customerId }: { customerId: string }) {
  const lifetime = useOperationLifetime(`AdminCustomerDetail:${customerId}`);
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const changing = useRef(false);

  useEffect(() => {
    if (session?.user.role !== 'ADMIN') return;
    let active = true;
    const scope = lifetime.capture();
    void authenticatedRequest<AdminCustomer>(`/admin/customers/${customerId}`, {
      scope,
    })
      .then((value) => {
        if (!lifetime.isActive()) return;
        if (active && lifetime.isActive()) setCustomer(value);
      })
      .catch((cause: unknown) => {
        if (!lifetime.isActive()) return;
        if (active && lifetime.isActive())
          setError(message(cause, 'Không thể tải Customer.'));
      })
      .finally(() => {
        if (active && lifetime.isActive()) setLoading(false);
      });
    return () => {
      active = false;
      scope.dispose();
    };
  }, [customerId, session?.user.role, lifetime]);

  async function change(action: 'lock' | 'unlock') {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    if (
      changing.current ||
      !window.confirm(
        `Xác nhận ${action === 'lock' ? 'khóa' : 'mở khóa'} Customer này?`,
      )
    )
      return;
    changing.current = true;
    setLoading(true);
    setError('');
    try {
      await authenticatedRequest<void>(
        `/admin/customers/${customerId}/${action}`,
        {
          method: 'POST',
          scope,
        },
      );
      if (!scope.isActive()) return;
      const value = await authenticatedRequest<AdminCustomer>(
        `/admin/customers/${customerId}`,
        { scope },
      );
      if (!scope.isActive()) return;
      setCustomer(value);
    } catch (cause) {
      if (!scope.isActive()) return;
      setError(message(cause, 'Không thể thay đổi trạng thái Customer.'));
    } finally {
      if (!scope.isActive()) return;
      changing.current = false;
      setLoading(false);
    }
  }

  if (session?.user.role !== 'ADMIN')
    return (
      <InlineAlert tone="error">Khu vực này chỉ dành cho Admin.</InlineAlert>
    );
  return (
    <section
      aria-labelledby="customer-detail-heading"
      className={styles.detail}
    >
      <h2 id="customer-detail-heading">Chi tiết Customer</h2>
      {loading && <LocalStatus tone="info">Đang tải…</LocalStatus>}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {customer ? (
        <dl>
          <dt>Email</dt>
          <dd>{customer.email}</dd>
          <dt>Tên hiển thị</dt>
          <dd>{customer.displayName ?? '—'}</dd>
          <dt>Phương thức đăng nhập</dt>
          <dd>{customer.loginMethod}</dd>
          <dt>Trạng thái</dt>
          <dd>{customer.status}</dd>
          <dt>Ngày tạo</dt>
          <dd>{new Date(customer.createdAt).toLocaleString('vi-VN')}</dd>
        </dl>
      ) : null}
      {customer ? (
        <Button
          type="button"
          variant={customer.status === 'ACTIVE' ? 'destructive' : 'secondary'}
          disabled={loading}
          onClick={() =>
            void change(customer.status === 'ACTIVE' ? 'lock' : 'unlock')
          }
        >
          {customer.status === 'ACTIVE' ? 'Khóa Customer' : 'Mở khóa Customer'}
        </Button>
      ) : null}
      <p>
        <Link href="/admin/customers">Quay lại danh sách</Link>
      </p>
    </section>
  );
}

export function AdminCustomerList() {
  const owner = usePrivateOwner('AdminCustomerList', 'ADMIN');
  return owner ? (
    <OwnedAdminCustomerList key={owner} />
  ) : (
    <p role="alert">Khu vực này chỉ dành cho Admin.</p>
  );
}

export function AdminCustomerDetail({ customerId }: { customerId: string }) {
  const owner = usePrivateOwner(`AdminCustomerDetail:${customerId}`, 'ADMIN');
  return owner ? (
    <OwnedAdminCustomerDetail key={owner} customerId={customerId} />
  ) : (
    <p role="alert">Khu vực này chỉ dành cho Admin.</p>
  );
}
