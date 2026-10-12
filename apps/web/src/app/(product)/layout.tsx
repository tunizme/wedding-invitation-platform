import type { ReactNode } from 'react';
import { SessionProvider } from '../../features/identity-access/session/session-provider';
import { AuthRecoveryNotice } from '../../features/identity-access/session/auth-recovery-notice';
import { beVietnamPro, cormorantGaramond } from '../../ui/platform/fonts';
import '../../ui/platform/tokens.css';
import { ProductShell } from '../../ui/product/product-shell';

export default function ProductLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className={`platformTokens ${beVietnamPro.variable} ${cormorantGaramond.variable}`}
    >
      <SessionProvider showChrome={false}>
        <ProductShell>
          <AuthRecoveryNotice />
          {children}
        </ProductShell>
      </SessionProvider>
    </div>
  );
}
