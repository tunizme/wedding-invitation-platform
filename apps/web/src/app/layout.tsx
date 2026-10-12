import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Tiệm làm thiệp',
  description:
    'Tạo thiệp cưới online, gửi trọn yêu thương cùng Tiệm làm thiệp.',
  icons: { icon: '/branding/logo.png', apple: '/branding/logo.png' },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
