import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  publicDir: '../web/public',
  plugins: [
    {
      name: 'prototype-only-rsvp-transport',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === './rsvp-api' && importer?.endsWith('/public-rsvp.tsx')) {
          return fileURLToPath(new URL('./src/rsvp-mock.ts', import.meta.url));
        }
      },
    },
    react(),
  ],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { strictPort: true },
});
