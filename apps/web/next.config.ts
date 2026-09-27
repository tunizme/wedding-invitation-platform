import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return ['/verify-email', '/reset-password', '/forgot-password'].map(
      (source) => ({
        source,
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          {
            key: 'Content-Security-Policy',
            value: `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`,
          },
        ],
      }),
    );
  },
  // pnpm 12 emits supply-chain status text in CLI subprocesses; use the
  // compiler API so Next receives structured TypeScript diagnostics directly.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
