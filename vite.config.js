import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
});
