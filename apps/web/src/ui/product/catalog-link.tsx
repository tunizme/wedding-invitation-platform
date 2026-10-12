'use client';

import Link from 'next/link';
import { useSyncExternalStore, type ReactNode } from 'react';
import { sessionStore } from '../../features/identity-access/session/store';

/** Catalog access follows the existing CUSTOMER-only backend policy. */
export function CatalogLink({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  const href =
    session?.user.role === 'CUSTOMER'
      ? '/templates'
      : session?.user.role === 'ADMIN'
        ? '/admin/templates'
        : '/login';
  return (
    <Link href={href} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
