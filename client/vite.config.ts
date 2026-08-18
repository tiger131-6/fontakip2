import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The /api requests are proxied to the Express server during development,
// so the frontend can use relative URLs and we avoid CORS entirely.
export default defineConfig({
  plugins: [react()],
  base: process.env.CAPACITOR_BUILD === '1' ? './' : '/',
  server: {
    port: 5173,
    host: true,
    watch: {
      // cap sync copies a ~70 MB seed DB into android/; Windows locks it and crashes Vite.
      ignored: ['**/android/**', '**/dist/nodejs-project/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
