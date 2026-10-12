'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowRight,
  ChevronDown,
  LayoutDashboard,
  Mail,
  PenLine,
  Settings,
  Users,
} from 'lucide-react';
import { sessionStore } from '../../features/identity-access/session/store';
import {
  logoutAll,
  logoutCurrent,
} from '../../features/identity-access/session/refresh-coordinator';
import { confirmDiscardChanges } from '../../features/identity-access/session/navigation-guard';
import type { UserProfile } from '../../features/identity-access/api/client';
import styles from './product-shell.module.css';

function Brand() {
  return (
    <Link
      className={styles.brand}
      href="/"
      aria-label="Tiệm làm thiệp — Trang chủ"
    >
      <Image src="/branding/logo.png" width={44} height={44} alt="" />
      <span>Tiệm làm thiệp</span>
    </Link>
  );
}

function AccountDisclosure({ user }: { user: UserProfile }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const customer = user.role === 'CUSTOMER';
  return (
    <div
      ref={root}
      className={styles.account}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={styles.avatarButton}
        aria-label="Tài khoản"
        aria-expanded={open}
        aria-controls="product-account-disclosure"
        onClick={() => setOpen(!open)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {(user.displayName?.trim() || user.email)
            .slice(0, 1)
            .toLocaleUpperCase('vi')}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id="product-account-disclosure" className={styles.disclosure}>
          <div className={styles.identity}>
            <strong>{user.displayName || 'Tài khoản của bạn'}</strong>
            <span>{user.email}</span>
          </div>
          <nav aria-label="Điều hướng tài khoản" onClick={() => setOpen(false)}>
            {customer ? (
              <>
                <Link href="/overview">
                  <LayoutDashboard size={18} aria-hidden="true" />
                  Tổng quan
                </Link>
                <Link href="/invitations">
                  <Mail size={18} aria-hidden="true" />
                  Thiệp của tôi
                </Link>
                <Link href="/templates">
                  <PenLine size={18} aria-hidden="true" />
                  Tạo thiệp mới
                </Link>
              </>
            ) : (
              <>
                <Link href="/admin/templates">
                  <PenLine size={18} aria-hidden="true" />
                  Quản lý mẫu
                </Link>
                <Link href="/admin/customers">
                  <Users size={18} aria-hidden="true" />
                  Quản lý khách hàng
                </Link>
              </>
            )}
            <Link href="/account">
              <Settings size={18} aria-hidden="true" />
              Thông tin cá nhân
            </Link>
          </nav>
          <div className={styles.logout}>
            <button
              type="button"
              onClick={() => {
                if (confirmDiscardChanges()) void logoutCurrent();
              }}
            >
              Đăng xuất
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDiscardChanges()) void logoutAll();
              }}
            >
              Đăng xuất mọi thiết bị
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  if (pathname && /^\/templates\/[^/]+\/demo$/.test(pathname))
    return <div className={styles.shell}>{children}</div>;
  if (pathname && /^\/admin\/templates\/[^/]+\/edit$/.test(pathname))
    return (
      <div className={styles.shell}>
        <a className={styles.skip} href="#product-content">
          Đến nội dung chính
        </a>
        {session && (
          <div className={styles.editorAccount}>
            <AccountDisclosure key={session.user.id} user={session.user} />
          </div>
        )}
        <div id="product-content" tabIndex={-1} className={styles.content}>
          {children}
        </div>
      </div>
    );
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#product-content">
        Đến nội dung chính
      </a>
      <header className={styles.header}>
        <Brand />
        <nav className={styles.navigation} aria-label="Điều hướng chính">
          {session?.user.role === 'ADMIN' ? (
            <Link href="/admin/templates">Quản trị</Link>
          ) : (
            <Link href="/templates">Mẫu thiệp</Link>
          )}
          {session ? (
            <AccountDisclosure
              key={sessionStore.identityEpoch()}
              user={session.user}
            />
          ) : (
            <Link className={styles.signIn} href="/login">
              Đăng nhập <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </nav>
      </header>
      <div id="product-content" tabIndex={-1} className={styles.content}>
        {children}
      </div>
      <footer className={styles.footer}>
        <p>
          Tiệm làm thiệp
          <br />
          <span className={styles.footerMuted}>
            Mỗi lời mời, một câu chuyện.
          </span>
        </p>
        <p>
          Được tạo bằng sự chăm chút
          <br />
          <span className={styles.footerMuted}>
            Cho những ngày đáng nhớ của bạn.
          </span>
        </p>
        <span className={styles.footerMuted}>tiemlamthiep@gmail.com</span>
      </footer>
    </div>
  );
}
