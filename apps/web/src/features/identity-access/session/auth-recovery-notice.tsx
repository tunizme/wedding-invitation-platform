'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  readSelector,
  selectorStore,
  type RecoveryReason,
} from './auth-selector';
import { sessionStore } from './store';
import { reconcilePendingIntent } from './operation-recovery';

const copy: Record<RecoveryReason, { message: string; action: string }> = {
  OPERATION_FAILED: {
    message: 'Máy chủ không hoàn tất thao tác. Phiên cục bộ đã kết thúc.',
    action: 'Đăng nhập lại',
  },
  OPERATION_UNCERTAIN: {
    message:
      'Chưa xác nhận được kết quả trên máy chủ. Phiên cục bộ đã kết thúc; thao tác sẽ không tự động gửi lại.',
    action: 'Đăng nhập lại',
  },
  NOT_DISPATCHED: {
    message: 'Không thể gửi yêu cầu xác nhận phiên đăng nhập.',
    action: 'Đăng nhập lại',
  },
  STORAGE_UNAVAILABLE: {
    message: 'Không thể xác nhận phiên đăng nhập trong trình duyệt này.',
    action: 'Thử lại',
  },
  STORAGE_RESET: {
    message: 'Không thể xác nhận phiên đăng nhập trong trình duyệt này.',
    action: 'Đăng nhập lại',
  },
  CREDENTIAL_MISSING: {
    message: 'Phiên đăng nhập trong trình duyệt này đã mất.',
    action: 'Đăng nhập lại',
  },
  CAPACITY_EXHAUSTED: {
    message: 'Trình duyệt đang có quá nhiều phiên chưa được xác nhận.',
    action: 'Xóa dữ liệu trang cho website hoặc dùng trình duyệt khác.',
  },
  CONTEXT_UNAVAILABLE: {
    message: 'Không thể xác nhận phiên đăng nhập trong trình duyệt này.',
    action: 'Đăng nhập lại',
  },
};

export function AuthRecoveryNotice() {
  const [reason, setReason] = useState<RecoveryReason | null>(() => {
    const ended = sessionStore.lastEndReason();
    return ended === 'LOGOUT' || ended === 'SUPERSEDED' ? null : ended;
  });
  const notice = useRef<HTMLDivElement>(null);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [showCapacityInstructions, setShowCapacityInstructions] =
    useState(false);

  useEffect(() => {
    let active = true;
    const inspect = () => {
      const version = sessionStore.version();
      const ended = sessionStore.lastEndReason();
      setReason(ended === 'LOGOUT' || ended === 'SUPERSEDED' ? null : ended);
      setUncertain(false);
      setReceipt(null);
      if (sessionStore.get()) return;
      selectorStore()
        .then(async (store) => {
          const authorityGeneration = store.generation?.();
          const record = await readSelector(store);
          if (
            !active ||
            version !== sessionStore.version() ||
            store.generation?.() !== authorityGeneration
          )
            return;
          if (record.recoveryReason) setReason(record.recoveryReason);
          if (
            record.pendingIntent &&
            (!record.recoveryReason ||
              record.recoveryReason === 'OPERATION_UNCERTAIN')
          ) {
            setUncertain(true);
            const result = await reconcilePendingIntent(
              record,
              undefined,
              undefined,
              () =>
                active &&
                version === sessionStore.version() &&
                store.generation?.() === authorityGeneration,
            );
            if (
              active &&
              version === sessionStore.version() &&
              store.generation?.() === authorityGeneration
            ) {
              if (result.state === 'NO_PENDING_INTENT') setUncertain(false);
              else if (result.state === 'RECEIPT') {
                if (
                  record.pendingIntent?.kind === 'LOGOUT' &&
                  result.outcome.state === 'COMMITTED'
                ) {
                  setReason(null);
                  setUncertain(false);
                  setReceipt('Máy chủ đã xác nhận đăng xuất.');
                  return;
                }
                const messages = {
                  COMMITTED:
                    'Máy chủ đã ghi nhận thao tác; trình duyệt vẫn cần xác nhận phiên trước khi báo thành công.',
                  FAILED:
                    'Máy chủ không hoàn tất thao tác. Bạn có thể bắt đầu một lần đăng nhập mới.',
                  SUPERSEDED:
                    'Thao tác đã được thay thế bởi một yêu cầu mới hơn.',
                  EXPIRED: 'Yêu cầu đã hết hạn và không được tự động gửi lại.',
                  RESERVED:
                    'Máy chủ vẫn đang giữ yêu cầu; chưa thể xác nhận kết quả cuối cùng.',
                } as const;
                setReceipt(messages[result.outcome.state]);
              } else if (result.outcome?.state === 'RESERVED') {
                setReceipt(
                  'Máy chủ vẫn đang giữ yêu cầu; chưa thể xác nhận kết quả cuối cùng.',
                );
              }
            }
          }
        })
        .catch(() => {
          if (active && version === sessionStore.version())
            setReason('STORAGE_UNAVAILABLE');
        });
    };
    const unsubscribe = sessionStore.subscribe(inspect);
    inspect();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (reason) notice.current?.focus();
  }, [reason]);

  const item = reason ? copy[reason] : null;
  if (!item && !uncertain && !receipt) return null;
  return (
    <>
      {(uncertain || receipt) && (
        <div
          role="status"
          aria-live="polite"
          style={{ maxWidth: '40rem', margin: '1rem auto', padding: '1rem' }}
        >
          {uncertain && (
            <p>Trạng thái thao tác đăng nhập chưa được xác nhận.</p>
          )}
          {receipt && <p>{receipt}</p>}
          {uncertain && (
            <>
              <p>
                Không gửi lại thao tác này. Tải lại trang để kiểm tra trạng thái
                bằng yêu cầu chỉ đọc.
              </p>
              <button type="button" onClick={() => window.location.reload()}>
                Kiểm tra lại trạng thái
              </button>
            </>
          )}
        </div>
      )}
      {reason && item && (
        <div
          ref={notice}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          style={{
            maxWidth: '40rem',
            margin: '1rem auto',
            padding: '1rem',
            border: '1px solid #9a3412',
            borderRadius: '0.5rem',
            color: '#431407',
            background: '#fff7ed',
          }}
        >
          <p>{item.message}</p>
          {reason === 'STORAGE_UNAVAILABLE' ||
          reason === 'CAPACITY_EXHAUSTED' ? (
            <p>{item.action}</p>
          ) : (
            <Link href="/login">{item.action}</Link>
          )}
          {reason === 'STORAGE_UNAVAILABLE' && (
            <button type="button" onClick={() => window.location.reload()}>
              Thử lại
            </button>
          )}
          {reason === 'CAPACITY_EXHAUSTED' && (
            <>
              <button
                type="button"
                aria-expanded={showCapacityInstructions}
                aria-controls="capacity-recovery-instructions"
                onClick={() =>
                  setShowCapacityInstructions((visible) => !visible)
                }
              >
                Cách xóa dữ liệu trang
              </button>
              {showCapacityInstructions && (
                <div id="capacity-recovery-instructions">
                  <p>
                    Mở cài đặt quyền riêng tư của trình duyệt, tìm dữ liệu của
                    website này rồi xóa dữ liệu riêng cho website. Thao tác này
                    sẽ đăng xuất bạn khỏi website. Nếu không thể xóa dữ liệu,
                    hãy dùng một trình duyệt khác.
                  </p>
                  <p>Website sẽ không tự xóa dữ liệu trình duyệt của bạn.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
