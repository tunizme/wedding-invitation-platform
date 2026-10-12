'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  bootstrapSession,
  logoutAll,
  logoutCurrent,
  startPeerSync,
} from './refresh-coordinator';
import {
  confirmDiscardChanges,
  installNavigationGuard,
} from './navigation-guard';
import { onSelectorStorageClose, selectorStore } from './auth-selector';
import { sessionStore } from './store';
import { Button } from '../../../ui/platform/button';
import chrome from '../../../ui/platform/session-chrome.module.css';

export function SessionProvider({
  children,
  showChrome = true,
}: {
  children: ReactNode;
  showChrome?: boolean;
}) {
  const pathname = usePathname();
  useEffect(() => {
    const stopGuard = installNavigationGuard();
    const stopPeers = startPeerSync();
    return () => {
      stopPeers();
      stopGuard();
    };
  }, []);
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
      pathname === '/internal/invitation-renderer' ||
      // The result page owns intent-scoped admission. Generic bootstrap here
      // could rotate B while a stale OAuth A result is being displayed.
      pathname === '/oauth-result'
    )
      return;
    if (!sessionStore.get()) void bootstrapSession().catch(() => undefined);
  }, [pathname]);

  return (
    <>
      {session && showChrome ? (
        <nav aria-label="Phiên đăng nhập" className={chrome.nav}>
          <span className={chrome.account}>{session.user.email}</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (confirmDiscardChanges()) void logoutCurrent();
            }}
          >
            Đăng xuất
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (confirmDiscardChanges()) void logoutAll();
            }}
          >
            Đăng xuất mọi thiết bị
          </Button>
        </nav>
      ) : null}
      {children}
    </>
  );
}
