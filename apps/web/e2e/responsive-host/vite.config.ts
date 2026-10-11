import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  optimizeDeps: {
    noDiscovery: true,
    include: ['react', 'react-dom/client', 'zod', 'qrcode'],
  },
  publicDir: resolve(import.meta.dirname, '../../public'),
  resolve: {
    alias: { '@': resolve(import.meta.dirname, '../../src') },
    dedupe: ['react', 'react-dom'],
  },
  define: { 'process.env.NEXT_PUBLIC_API_BASE_URL': JSON.stringify('/api/v1') },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    fs: { allow: [resolve(import.meta.dirname, '../../../..')] },
  },
});
