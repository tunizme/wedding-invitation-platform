'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import styles from './authoring-workspace.module.css';

export function PreviewExit({ onClose }: { onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = button.current
      ?.closest('[data-preview]')
      ?.querySelector<HTMLElement>('[data-preview-trigger]');
    button.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        close.current();
      }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      requestAnimationFrame(() => {
        if (previous instanceof HTMLElement && previous.isConnected)
          previous.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <button
      ref={button}
      type="button"
      className={styles.previewExit}
      onClick={onClose}
      title="Quay lại chỉnh sửa (Esc)"
    >
      <ArrowLeft size={18} aria-hidden="true" /> Quay lại chỉnh sửa
    </button>
  );
}
