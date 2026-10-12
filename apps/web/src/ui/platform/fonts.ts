import localFont from 'next/font/local';

export const beVietnamPro = localFont({
  src: [
    {
      path: './fonts/be-vietnam-pro-BeVietnamPro-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/be-vietnam-pro-BeVietnamPro-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/be-vietnam-pro-BeVietnamPro-SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/be-vietnam-pro-BeVietnamPro-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-platform-sans',
  fallback: ['Arial', 'sans-serif'],
});

export const cormorantGaramond = localFont({
  src: './fonts/cormorant-garamond-CormorantGaramondvariable.ttf',
  weight: '500',
  style: 'normal',
  display: 'swap',
  variable: '--font-platform-editorial',
  fallback: ['Georgia', 'serif'],
});
