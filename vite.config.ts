import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  appType: 'custom',
  publicDir: false,
  cacheDir: '.generated/vite',
  optimizeDeps: { entries: ['src/entry-client.tsx'] },
  build: {
    outDir: 'dist',
    sourcemap: false,
    manifest: true,
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
