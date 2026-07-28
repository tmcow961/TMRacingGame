import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
});
