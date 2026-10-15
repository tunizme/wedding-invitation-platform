'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Info, X } from 'lucide-react';
import styles from './toast.module.css';

export function Toast({
  message,
  onDismiss,
  duration = 5000,
}: {
  message: string;
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, duration]);

  if (!message) return null;
  const Icon = message.startsWith('Đã ') ? CheckCircle2 : Info;
  return createPortal(
    <div className={styles.toast}>
      <Icon size={20} aria-hidden="true" className={styles.icon} />
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.message}
      >
        {message}
      </div>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={onDismiss}
        className={styles.close}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
