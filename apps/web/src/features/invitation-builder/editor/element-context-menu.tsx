'use client';
import { useEffect, useRef } from 'react';
import styles from './invitation-editor.module.css';

export type ContextAction =
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'front'
  | 'back'
  | 'forward'
  | 'backward'
  | 'lock';
function ContextMenuItems({
  locked,
  index,
  last,
  canPaste,
  onAction,
}: {
  locked: boolean;
  index: number;
  last: number;
  canPaste: boolean;
  onAction: (action: ContextAction) => void;
}) {
  const items: [ContextAction, string, string, boolean][] = [
    ['copy', 'Sao chép', 'Ctrl+C', false],
    ['cut', 'Cắt', 'Ctrl+X', locked],
    ['paste', 'Dán', 'Ctrl+V', !canPaste],
    ['duplicate', 'Tạo bản sao', 'Ctrl+D', false],
    ['delete', 'Xóa phần tử', 'Del', locked],
    ['front', 'Đưa lên trên cùng', '', index === last],
    ['back', 'Đưa xuống dưới cùng', '', index === 0],
    ['forward', 'Đưa lên một lớp', '', index === last],
    ['backward', 'Đưa xuống một lớp', '', index === 0],
    ['lock', locked ? 'Mở khóa vị trí' : 'Khóa vị trí', '', false],
  ];
  return items.map(([action, label, shortcut, disabled]) => (
    <button
      key={action}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onAction(action)}
    >
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  ));
}

export function ElementContextMenu({
  x,
  y,
  onClose,
  ...items
}: {
  x: number;
  y: number;
  onClose: () => void;
  locked: boolean;
  index: number;
  last: number;
  canPaste: boolean;
  onAction: (action: ContextAction) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = menu.current;
    if (!node) return;
    const trigger = document.activeElement;
    const place = () => {
      const bounds = node.getBoundingClientRect();
      node.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
      node.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    };
    place();
    node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [x, y]);
  return (
    <>
      <div
        aria-hidden
        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menu}
        role="menu"
        aria-label="Menu phần tử"
        className={styles.contextMenu}
        style={{
          position: 'fixed',
          left: x,
          top: y,
          zIndex: 41,
          maxWidth: 'calc(100vw - 16px)',
          maxHeight: 'calc(100dvh - 16px)',
          overflowY: 'auto',
        }}
        onKeyDown={(event) => {
          // Keep editor shortcuts from deleting or deselecting behind the menu.
          event.stopPropagation();
          if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault();
            onClose();
            return;
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
            return;
          event.preventDefault();
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              'button:not(:disabled)',
            ),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index +
                    (event.key === 'ArrowDown' ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }}
      >
        <ContextMenuItems {...items} />
      </div>
    </>
  );
}
