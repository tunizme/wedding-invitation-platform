'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { sessionStore } from '../identity-access/session/store';
import { getInvitation } from './api';
import { listRsvps, setRsvpState } from './rsvp-owner-api';
import { BuilderApiError } from '../invitation-builder/api/client';
import type { RsvpItem } from './rsvp-api';
export function RsvpManagement({ id }: { id: string }) {
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  if (session?.user.role !== 'CUSTOMER' || session.user.status !== 'ACTIVE')
    return <p role="alert">Khu vực này chỉ dành cho Customer.</p>;
  // Private state belongs to a principal/resource, never just to a role.
  // Token renewal leaves this key intact; identity changes discard the entire
  // instance, including its async admission guard and outstanding generations.
  return (
    <OwnedRsvpManagement
      key={`${session.user.id}:${id}`}
      id={id}
      customerId={session.user.id}
    />
  );
}

function OwnedRsvpManagement({
  id,
  customerId,
}: {
  id: string;
  customerId: string;
}) {
  const authorized = useCallback(() => {
    const user = sessionStore.get()?.user;
    return (
      user?.id === customerId &&
      user.role === 'CUSTOMER' &&
      user.status === 'ACTIVE'
    );
  }, [customerId]);
  const [items, setItems] = useState<RsvpItem[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [control, setControl] = useState<{
      rsvpOpen: boolean;
      controlVersion: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false),
    [stale, setStale] = useState(false);
  const generation = useRef(0),
    operation = useRef(false);
  const load = useCallback(async () => {
    if (operation.current || !authorized()) return;
    operation.current = true;
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const [detail, page] = await Promise.all([
        getInvitation(id),
        listRsvps(id),
      ]);
      if (current !== generation.current || !authorized()) return;
      setControl({
        rsvpOpen: detail.rsvpOpen,
        controlVersion: detail.controlVersion,
      });
      setItems(page.items);
      setCursor(page.nextCursor);
      setLoaded(true);
      setStale(false);
    } catch (cause) {
      if (current === generation.current && authorized())
        setError(
          cause instanceof Error ? cause.message : 'Không thể tải phản hồi.',
        );
    } finally {
      operation.current = false;
      if (current === generation.current && authorized()) setBusy(false);
    }
  }, [id, authorized]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(timer);
      invalidate();
    };
  }, [load, invalidate]);
  async function toggle() {
    if (!control || operation.current || stale || !authorized()) return;
    operation.current = true;
    setBusy(true);
    setError('');
    const current = generation.current;
    try {
      const result = await setRsvpState(
        id,
        control.controlVersion,
        !control.rsvpOpen,
      );
      if (current === generation.current && authorized()) setControl(result);
    } catch (cause) {
      if (current === generation.current && authorized()) {
        if (
          cause instanceof BuilderApiError &&
          cause.code === 'VERSION_CONFLICT'
        ) {
          setStale(true);
          setError(
            'Trạng thái đã đổi ở nơi khác. Tải lại trước khi đóng/mở RSVP.',
          );
        } else
          setError(
            cause instanceof Error
              ? cause.message
              : 'Không thể đổi trạng thái.',
          );
      }
    } finally {
      operation.current = false;
      if (current === generation.current && authorized()) setBusy(false);
    }
  }
  async function more() {
    if (!cursor || operation.current || !authorized()) return;
    operation.current = true;
    setBusy(true);
    setError('');
    const current = generation.current;
    try {
      const page = await listRsvps(id, cursor);
      if (current === generation.current && authorized()) {
        setItems((previous) => {
          const seen = new Set(previous.map((item) => item.id));
          return [
            ...previous,
            ...page.items.filter((item) => !seen.has(item.id)),
          ];
        });
        setCursor(page.nextCursor);
      }
    } catch (cause) {
      if (current === generation.current && authorized())
        setError(
          cause instanceof Error ? cause.message : 'Không thể tải phản hồi.',
        );
    } finally {
      operation.current = false;
      if (current === generation.current && authorized()) setBusy(false);
    }
  }
  return (
    <section aria-label="Quản lý RSVP">
      {control && (
        <>
          <p role="status">
            Nhận RSVP: {control.rsvpOpen ? 'Đang mở' : 'Đã đóng'}
          </p>
          <button disabled={busy || stale} onClick={() => void toggle()}>
            {control.rsvpOpen ? 'Đóng nhận RSVP' : 'Mở nhận RSVP'}
          </button>
        </>
      )}
      <button disabled={busy} onClick={() => void load()}>
        Tải lại phản hồi
      </button>
      {busy && <p role="status">Đang tải…</p>}
      {error && <p role="alert">{error}</p>}
      {loaded && items.length === 0 && <p>Chưa có phản hồi.</p>}
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.name}</strong> ·{' '}
            {item.attendance === 'ATTENDING' ? 'Có tham dự' : 'Không tham dự'} ·{' '}
            {item.partySize} người
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {item.message}
            </p>
            <time dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleString('vi-VN')}
            </time>
          </li>
        ))}
      </ol>
      {cursor && (
        <button disabled={busy} onClick={() => void more()}>
          Phản hồi tiếp
        </button>
      )}
    </section>
  );
}
