import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep the long-lived dev server's output/lock separate from owned auth
  // transition stacks that run browser checkpoints against another API.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Next writes generated route-type includes to the selected config. Owned
  // stacks pass a disposable copy so the tracked application tsconfig stays
  // untouched; normal development uses the standard tsconfig.json.
  typescript: {
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH ?? 'tsconfig.json',
  },
  output: 'standalone',
  // Owned keyboard acceptance excludes Next's development-only toolbar.
  // Compile/runtime errors still surface with the indicator disabled.
  devIndicators: process.env.FRONTEND_TEST_SEED ? false : undefined,
  async headers() {
    return [
      '/verify-email',
      '/activate-account',
      '/reset-password',
      '/forgot-password',
      '/internal/invitation-renderer',
      '/i/:slug',
    ].map((source) => ({
      source,
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ...(['/internal/invitation-renderer', '/i/:slug'].includes(source)
          ? [
              { key: 'Cache-Control', value: 'no-store' },
              { key: 'Pragma', value: 'no-cache' },
            ]
          : []),
        {
          key: 'Content-Security-Policy',
          value:
            source === '/internal/invitation-renderer'
              ? `default-src 'none'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
              : source === '/i/:slug'
                ? `default-src 'none'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${process.env.NEXT_PUBLIC_API_BASE_URL ? new URL(process.env.NEXT_PUBLIC_API_BASE_URL).origin : ''}; font-src 'self'; connect-src 'self' ${process.env.NEXT_PUBLIC_API_BASE_URL ? new URL(process.env.NEXT_PUBLIC_API_BASE_URL).origin : ''}; media-src 'self' blob: ${process.env.NEXT_PUBLIC_API_BASE_URL ? new URL(process.env.NEXT_PUBLIC_API_BASE_URL).origin : ''}; frame-src https://www.google.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
                : `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`,
        },
      ],
    }));
  },
  // pnpm 12 emits supply-chain status text in CLI subprocesses; use the
  // compiler API so Next receives structured TypeScript diagnostics directly.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
