'use client';
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { Button } from './button';
import styles from './modal-surface.module.css';

export type ModalSurfaceProps = {
  /** Visible heading and the dialog's accessible name. */
  label: string;
  variant?: 'drawer' | 'centered';
  /** Called exactly once when the user closes the surface (Close or Escape). */
  onClose: () => void;
  closeLabel?: string;
  /** Control focused on open; defaults to the heading. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Trigger to restore on close; defaults to the element focused on open. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Logical workspace to focus when the trigger no longer exists. */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/**
 * Native <dialog> modal (Drawer >= 768px, full-screen Sheet below). The browser
 * owns focus containment, the inert background and Escape; this component only
 * wires the lifecycle: idempotent close, initial/return/fallback focus and
 * cleanup. It does not nest modals or add a competing focus trap.
 */
export function ModalSurface({
  label,
  variant = 'drawer',
  onClose,
  closeLabel = 'Đóng',
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef,
  children,
}: ModalSurfaceProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  const focusRefs = useRef({
    initialFocusRef,
    returnFocusRef,
    fallbackFocusRef,
  });
  const requestClose = useRef<() => void>(() => undefined);

  // Latest props are read through refs so unstable callers (new ref objects or
  // callbacks every render) can never re-run the mount effect and re-open the
  // dialog.
  useEffect(() => {
    onCloseRef.current = onClose;
    focusRefs.current = { initialFocusRef, returnFocusRef, fallbackFocusRef };
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger =
      focusRefs.current.returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      onCloseRef.current();
    };
    const close = () => {
      if (closed) return;
      if (dialog.open) dialog.close();
      finish();
    };
    const onCancel = (event: Event) => {
      // Escape: keep React state authoritative instead of the native default.
      event.preventDefault();
      close();
    };
    // StrictMode cleanup queues a native close event. It can arrive after
    // the next mount has reopened the dialog and must not close that mount.
    const onNativeClose = () => {
      if (!dialog.open) finish();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onNativeClose);
    requestClose.current = close;
    if (!dialog.open) dialog.showModal();
    (focusRefs.current.initialFocusRef?.current ?? headingRef.current)?.focus();
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onNativeClose);
      requestClose.current = () => undefined;
      if (dialog.open) dialog.close();
      // A trigger that is gone, hidden or disabled cannot take focus: fall back
      // to the logical workspace instead of dropping focus onto <body>.
      if (trigger?.isConnected) trigger.focus();
      if (!trigger?.isConnected || document.activeElement !== trigger)
        focusRefs.current.fallbackFocusRef?.current?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={[styles.dialog, variant === 'centered' && styles.centered]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (variant !== 'centered' || event.target !== event.currentTarget)
          return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          requestClose.current();
      }}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className={styles.heading}
          >
            {label}
          </h2>
          <Button
            variant="secondary"
            onClick={() => requestClose.current()}
            className={styles.close}
          >
            {closeLabel}
          </Button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
