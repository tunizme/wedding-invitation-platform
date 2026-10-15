'use client';
import { useEffect, useRef } from 'react';
import styles from './asset-delete-dialog.module.css';

/**
 * Confirmation before deleting a library image. When elements still use the
 * image, the dialog warns that they will be removed with it.
 */
export function AssetDeleteDialog({
  usage,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  usage: number;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    // Destructive action: start on the safe choice.
    cancel.current?.focus();
  }, []);
  const used = usage > 0;
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="asset-delete-title"
      aria-describedby="asset-delete-body"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className={used ? styles.withIcon : undefined}>
        {used && (
          <span className={styles.icon} aria-hidden="true">
            !
          </span>
        )}
        <h2 id="asset-delete-title" className={styles.title}>
          {used ? 'Ảnh đang được sử dụng' : 'Xóa ảnh'}
        </h2>
        <div id="asset-delete-body" className={styles.body}>
          {used ? (
            <>
              <p>Ảnh này đang được sử dụng trong {usage} thành phần:</p>
              <ul className={styles.usage}>
                <li>{usage} thành phần của trang</li>
              </ul>
              <p className={styles.strong}>
                Nếu bạn xóa ảnh này, các thành phần đó cũng sẽ bị xóa theo.
              </p>
              <p className={styles.note}>
                <strong>Lưu ý:</strong> Nếu ảnh đang được sử dụng ở các trang
                khác, việc xóa ảnh sẽ ảnh hưởng đến các trang đó.
              </p>
              <p className={styles.strong}>
                Bạn có chắc chắn muốn tiếp tục xóa?
              </p>
            </>
          ) : (
            <>
              <p>Bạn có chắc chắn muốn xóa ảnh này không?</p>
              <p className={styles.note}>
                <strong>Lưu ý:</strong> Nếu ảnh đang được sử dụng ở các trang
                thiệp khác, việc xóa ảnh sẽ ảnh hưởng đến tất cả các trang đó.
              </p>
            </>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className={styles.footer}>
        <button
          ref={cancel}
          type="button"
          className={styles.cancel}
          disabled={busy}
          onClick={onCancel}
        >
          Hủy
        </button>
        <button
          type="button"
          className={used ? styles.danger : styles.primary}
          disabled={busy}
          aria-busy={busy}
          onClick={onConfirm}
        >
          {busy ? 'Đang xóa…' : used ? 'Vẫn xóa' : 'Xóa'}
        </button>
      </div>
    </dialog>
  );
}
