'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore, type ReactNode } from 'react';
import { LayoutDashboard, Mail, PenLine, Settings } from 'lucide-react';
import { sessionStore } from '../../features/identity-access/session/store';
import styles from './account-workspace.module.css';

export function AccountWorkspace({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.get,
    () => null,
  );
  const pathname = usePathname();
  const user = session?.user.role === 'CUSTOMER' ? session.user : null;
  const links = [
    { href: '/overview', title: 'Tổng quan', Icon: LayoutDashboard },
    { href: '/invitations', title: 'Thiệp của tôi', Icon: Mail },
    { href: '/account', title: 'Thông tin cá nhân', Icon: Settings },
    { href: '/templates', title: 'Tạo thiệp mới', Icon: PenLine },
  ];
  return (
    // Keep the content subtree mounted across logout: ProfileForm owns its
    // non-private confirmed password-change milestone and resets private data
    // itself when the principal changes. Only account chrome is conditional.
    <div className={user ? styles.workspace : undefined}>
      {user && (
        <aside className={styles.sidebar}>
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              {(user.displayName?.trim() || user.email)
                .slice(0, 1)
                .toLocaleUpperCase('vi')}
            </span>
            <strong>{user.displayName || 'Bạn và những lời mời'}</strong>
            <span>{user.email}</span>
          </div>
          <nav aria-label="Không gian của bạn">
            {links.map(({ href, title, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                {title}
              </Link>
            ))}
          </nav>
        </aside>
      )}
      <div className={user ? styles.content : undefined}>{children}</div>
    </div>
  );
}
