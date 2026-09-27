'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import {
  bootstrapSession,
  logoutAll,
  logoutCurrent,
} from './refresh-coordinator';
import { sessionStore } from './store';

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );

  useEffect(() => {
    if (!sessionStore.get()) void bootstrapSession();
  }, []);

  return (
    <>
      {session ? (
        <nav aria-label="Phiên đăng nhập">
          <span>{session.user.email}</span>{' '}
          <button type="button" onClick={() => void logoutCurrent()}>
            Đăng xuất
          </button>{' '}
          <button type="button" onClick={() => void logoutAll()}>
            Đăng xuất mọi thiết bị
          </button>
        </nav>
      ) : null}
      {children}
    </>
  );
}
