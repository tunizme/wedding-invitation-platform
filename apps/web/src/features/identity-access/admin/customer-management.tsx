'use client';

import Link from 'next/link';
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

export function AdminCustomerList() {
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
    void authenticatedRequest<CustomerPage>(`/admin/customers?${params}`)
      .then((value) => {
        if (active) setPage(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(message(cause, 'Không thể tải danh sách Customer.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cursor, filters, session?.user.role]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
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
    return <p role="alert">Khu vực này chỉ dành cho Admin.</p>;

  return (
    <section aria-labelledby="customer-list-heading">
      <h2 id="customer-list-heading">Danh sách Customer</h2>
      <form
        onSubmit={search}
        style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}
      >
        <label htmlFor="customer-search">Tìm kiếm</label>
        <input
          id="customer-search"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
        />
        <label htmlFor="customer-status">Trạng thái</label>
        <select
          id="customer-status"
          name="status"
          defaultValue={filters.status}
        >
          <option value="">Tất cả</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="LOCKED">LOCKED</option>
        </select>
        <button type="submit" disabled={loading}>
          Tìm
        </button>
      </form>
      {loading && <p role="status">Đang tải…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && page?.items.length === 0 ? (
        <p>Không có Customer phù hợp.</p>
      ) : null}
      {page?.items.length ? (
        <ul>
          {page.items.map((customer) => (
            <li key={customer.id}>
              <Link href={`/admin/customers/${customer.id}`}>
                {customer.email}
              </Link>{' '}
              <span>— {customer.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {page?.page.hasMore && page.page.nextCursor ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => nextPage(page.page.nextCursor!)}
        >
          Trang tiếp
        </button>
      ) : null}
    </section>
  );
}

export function AdminCustomerDetail({ customerId }: { customerId: string }) {
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
    void authenticatedRequest<AdminCustomer>(`/admin/customers/${customerId}`)
      .then((value) => {
        if (active) setCustomer(value);
      })
      .catch((cause: unknown) => {
        if (active) setError(message(cause, 'Không thể tải Customer.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId, session?.user.role]);

  async function change(action: 'lock' | 'unlock') {
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
        },
      );
      const value = await authenticatedRequest<AdminCustomer>(
        `/admin/customers/${customerId}`,
      );
      setCustomer(value);
    } catch (cause) {
      setError(message(cause, 'Không thể thay đổi trạng thái Customer.'));
    } finally {
      changing.current = false;
      setLoading(false);
    }
  }

  if (session?.user.role !== 'ADMIN')
    return <p role="alert">Khu vực này chỉ dành cho Admin.</p>;
  return (
    <section aria-labelledby="customer-detail-heading">
      <h2 id="customer-detail-heading">Chi tiết Customer</h2>
      {loading && <p role="status">Đang tải…</p>}
      {error && <p role="alert">{error}</p>}
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
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            void change(customer.status === 'ACTIVE' ? 'lock' : 'unlock')
          }
        >
          {customer.status === 'ACTIVE' ? 'Khóa Customer' : 'Mở khóa Customer'}
        </button>
      ) : null}
      <p>
        <Link href="/admin/customers">Quay lại danh sách</Link>
      </p>
    </section>
  );
}
