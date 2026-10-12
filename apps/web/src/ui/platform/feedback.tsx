import type { HTMLAttributes, ReactNode } from 'react';
import styles from './controls.module.css';

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';
type Props = HTMLAttributes<HTMLDivElement> & {
  tone: Tone;
  children: ReactNode;
};
const toneClass: Record<Tone, string> = {
  success: styles.success,
  warning: styles.warning,
  error: styles.errorTone,
  info: styles.info,
  neutral: styles.neutral,
};

export function InlineAlert({ tone, children, className, ...rest }: Props) {
  return (
    <div
      {...rest}
      role="alert"
      className={[styles.feedback, toneClass[tone], className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

export function LocalStatus({ tone, children, className, ...rest }: Props) {
  return (
    <div
      {...rest}
      role="status"
      className={[styles.feedback, toneClass[tone], className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

export function StatusBadge({ tone, children, className, ...rest }: Props) {
  return (
    <span
      {...rest}
      className={[styles.badge, toneClass[tone], className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
