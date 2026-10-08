'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  bootstrapSession,
  logoutAll,
  logoutCurrent,
} from './refresh-coordinator';
import {
  confirmDiscardChanges,
  installNavigationGuard,
} from './navigation-guard';
import { onSelectorStorageClose, selectorStore } from './auth-selector';
import { sessionStore } from './store';

export function SessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => installNavigationGuard(), []);
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );

  useEffect(() => {
    // 006: storage reset (site data cleared) closes the IndexedDB connection;
    // end private admission immediately instead of waiting for the next refresh.
    const detach = onSelectorStorageClose(() =>
      sessionStore.clear('STORAGE_RESET'),
    );
    let cancelled = false;
    selectorStore().then(
      (store) => {
        if (cancelled) return;
        void store;
      },
      () => {
        if (!cancelled) sessionStore.clear('STORAGE_UNAVAILABLE');
      },
    );
    return () => {
      cancelled = true;
      detach();
    };
  }, []);

  useEffect(() => {
    // Public invitations and the isolated capture shell never need a session.
    // Rotating refresh credentials during navigation away from those pages can
    // strand the next protected page with the previous credential.
    if (
      pathname?.startsWith('/i/') ||
      pathname === '/internal/invitation-renderer'
    )
      return;
    if (!sessionStore.get()) void bootstrapSession().catch(() => undefined);
  }, [pathname]);

  return (
    <>
      {session ? (
        <nav aria-label="Phiên đăng nhập">
          <span>{session.user.email}</span>{' '}
          <button
            type="button"
            onClick={() => {
              if (confirmDiscardChanges()) void logoutCurrent();
            }}
          >
            Đăng xuất
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              if (confirmDiscardChanges()) void logoutAll();
            }}
          >
            Đăng xuất mọi thiết bị
          </button>
        </nav>
      ) : null}
      {children}
    </>
  );
}
