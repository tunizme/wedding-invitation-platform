'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../identity-access/session/operation-scope';
import { Button } from '../../ui/platform/button';
import { InlineAlert, LocalStatus } from '../../ui/platform/feedback';
import styles from './rsvp-management.module.css';
import { sessionStore } from '../identity-access/session/store';
import { getInvitation } from './api';
import { listRsvps, setRsvpState } from './rsvp-owner-api';
import { BuilderApiError } from '../invitation-builder/api/client';
import type { RsvpItem } from './rsvp-api';
import { formatVietnameseTimestamp } from './event-local-time';
export function RsvpManagement({
  id,
  assisted = false,
}: {
  id: string;
  assisted?: boolean;
}) {
  const owner = usePrivateOwner(id, assisted ? 'ADMIN' : 'CUSTOMER');
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  if (
    session?.user.role !== (assisted ? 'ADMIN' : 'CUSTOMER') ||
    session.user.status !== 'ACTIVE'
  )
    return <p role="alert">Khu vực này chỉ dành cho Customer.</p>;
  // Private state belongs to a principal/resource, never just to a role.
  // Token renewal leaves this key intact; identity changes discard the entire
  // instance, including its async admission guard and outstanding generations.
  return (
    <OwnedRsvpManagement
      key={owner}
      id={id}
      assisted={assisted}
      customerId={session.user.id}
      epoch={sessionStore.identityEpoch()}
    />
  );
}

function OwnedRsvpManagement({
  id,
  customerId,
  epoch,
  assisted,
}: {
  id: string;
  customerId: string;
  epoch: number;
  assisted: boolean;
}) {
  const lifetime = useOperationLifetime(`RsvpManagement:${id}`);
  const authorized = useCallback(() => {
    const user = sessionStore.get()?.user;
    return (
      lifetime.isActive() &&
      sessionStore.identityEpoch() === epoch &&
      user?.id === customerId &&
      user.role === (assisted ? 'ADMIN' : 'CUSTOMER') &&
      user.status === 'ACTIVE'
    );
  }, [customerId, epoch, lifetime, assisted]);
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
    const scope = lifetime.capture();
    setBusy(true);
    setError('');
    try {
      const [detail, page] = await Promise.all([
        getInvitation(id, { scope, ...(assisted ? { assisted: true } : {}) }),
        listRsvps(id, undefined, {
          scope,
          ...(assisted ? { assisted: true } : {}),
        }),
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
      scope.dispose();
      operation.current = false;
      if (current === generation.current && authorized()) setBusy(false);
    }
  }, [id, authorized, lifetime, assisted]);
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
    const scope = lifetime.capture();
    try {
      const result = await setRsvpState(
        id,
        control.controlVersion,
        !control.rsvpOpen,
        { scope, ...(assisted ? { assisted: true } : {}) },
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
      scope.dispose();
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
    const scope = lifetime.capture();
    try {
      const page = await listRsvps(id, cursor, {
        scope,
        ...(assisted ? { assisted: true } : {}),
      });
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
      scope.dispose();
      operation.current = false;
      if (current === generation.current && authorized()) setBusy(false);
    }
  }
  return (
    <section aria-label="Quản lý RSVP" className={styles.workspace}>
      {control && (
        <div className={styles.control}>
          <div>
            <h2>Lời hẹn từ những người thương</h2>
            <p className={styles.description}>
              Khách mời xác nhận tham dự từ đường dẫn thiệp công khai.
            </p>
          </div>
          <p role="status">
            Nhận RSVP: {control.rsvpOpen ? 'Đang mở' : 'Đã đóng'}
          </p>
          <Button
            variant="secondary"
            disabled={busy || stale}
            onClick={() => void toggle()}
          >
            {control.rsvpOpen ? 'Đóng nhận RSVP' : 'Mở nhận RSVP'}
          </Button>
        </div>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => void load()}>
        Tải lại phản hồi
      </Button>
      {busy && <LocalStatus tone="neutral">Đang tải…</LocalStatus>}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {loaded && items.length === 0 && <p>Chưa có phản hồi.</p>}
      <div className={styles.responses}>
        <div className={styles.tableHeading} aria-hidden="true">
          <span>Khách mời</span>
          <span>Tham dự</span>
          <span>Số người</span>
          <span>Lời nhắn</span>
          <span>Thời gian</span>
        </div>
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.name}</strong>
              <span
                className={
                  item.attendance === 'ATTENDING'
                    ? styles.attending
                    : styles.declined
                }
              >
                {item.attendance === 'ATTENDING'
                  ? 'Có tham dự'
                  : 'Không tham dự'}
              </span>
              <span>{item.partySize} người</span>
              <p className={styles.message}>
                {item.message || 'Chưa có lời nhắn'}
              </p>
              <time dateTime={item.createdAt}>
                {formatVietnameseTimestamp(item.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      </div>
      {cursor && (
        <Button variant="secondary" disabled={busy} onClick={() => void more()}>
          Phản hồi tiếp
        </Button>
      )}
    </section>
  );
}
