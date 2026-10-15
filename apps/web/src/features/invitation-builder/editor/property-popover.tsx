'use client';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './property-controls.module.css';

/** Portalled controls stay within the viewport, including inside the mobile drawer. */
export function PropertyPopover({
  label,
  trigger,
  children,
  className,
  style,
  width = 240,
  pressed = false,
  disabled = false,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  width?: number;
  pressed?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [portalParent, setPortalParent] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const popup = popupRef.current;
    if (popup?.showPopover) popup.showPopover();
    const reposition = () => {
      const trigger = triggerRef.current,
        popup = popupRef.current;
      if (!trigger || !popup) return;
      const rect = trigger.getBoundingClientRect();
      const bounds = popup.getBoundingClientRect();
      const available = window.innerHeight - 12;
      const below = rect.bottom + 8;
      const above = rect.top - bounds.height - 8;
      const left = Math.max(
        12,
        Math.min(
          rect.right - bounds.width,
          window.innerWidth - bounds.width - 12,
        ),
      );
      const top = Math.max(
        12,
        Math.min(
          below + bounds.height <= available
            ? below
            : above >= 12
              ? above
              : below,
          available - bounds.height,
        ),
      );
      setPosition((current) =>
        current.left === left && current.top === top ? current : { left, top },
      );
    };
    reposition();
    popup
      ?.querySelector<HTMLElement>('input,button,[tabindex="0"]')
      ?.focus({ preventScroll: true });
    const observer = new ResizeObserver(reposition);
    if (popupRef.current) observer.observe(popupRef.current);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popupRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      )
        setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const other = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) setOpen(false);
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('builder:property-popover', other);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('builder:property-popover', other);
    };
  }, [open, id]);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        data-active={pressed || open}
        className={className ?? styles.iconToggle}
        style={style}
        onClick={(event) => {
          setPortalParent(
            event.currentTarget.closest('dialog') ?? document.body,
          );
          if (!open)
            document.dispatchEvent(
              new CustomEvent('builder:property-popover', { detail: id }),
            );
          setOpen(!open);
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={popupRef}
            id={id}
            role="dialog"
            popover="manual"
            aria-label={label}
            className={styles.propertyPopover}
            style={{ width, left: position.left, top: position.top }}
          >
            {children}
          </div>,
          portalParent ?? document.body,
        )}
    </>
  );
}
