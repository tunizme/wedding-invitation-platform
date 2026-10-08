import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionProvider } from '../features/identity-access/session/session-provider';
import { AuthRecoveryNotice } from '../features/identity-access/session/auth-recovery-notice';

export const metadata: Metadata = {
  title: 'Wedding Invitation Platform',
  description: 'Project Foundation status page',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <SessionProvider>
          <AuthRecoveryNotice />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
