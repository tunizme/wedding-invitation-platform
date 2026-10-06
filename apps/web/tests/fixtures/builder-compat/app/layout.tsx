import type { ReactNode } from 'react';
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>{children}</body>
    </html>
  );
}
