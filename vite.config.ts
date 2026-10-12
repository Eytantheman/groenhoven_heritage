import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Cesium is loaded via CDN script tag — treat it as an external global
  build: {
    rollupOptions: {
      external: ['cesium'],
      output: {
        globals: { cesium: 'Cesium' },
      },
    },
  },
  server: {
    // Large scan files need no live reload, and OneDrive locks them while syncing,
    // which crashes the file watcher (EBUSY) — so don't watch them
    watch: { ignored: ['**/public/splats/**', '**/public/splat-viewer/**'] },
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
