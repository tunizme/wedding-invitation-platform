import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // pnpm 12 emits supply-chain status text in CLI subprocesses; use the
  // compiler API so Next receives structured TypeScript diagnostics directly.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
