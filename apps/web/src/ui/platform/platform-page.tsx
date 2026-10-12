import type { ReactNode } from 'react';
import styles from './platform-page.module.css';

export function PlatformPage({
  children,
  width = 'reading',
  className,
}: {
  children: ReactNode;
  width?: 'reading' | 'editorial' | 'wide';
  className?: string;
}) {
  return (
    <main className={[styles.page, className].filter(Boolean).join(' ')}>
      <div className={styles[width]}>{children}</div>
    </main>
  );
}

export const platformPageStyles = {
  heading: styles.heading,
  lead: styles.lead,
  editorialHeading: styles.editorialHeading,
};
