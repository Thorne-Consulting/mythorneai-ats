import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5080',
      '/auth': 'http://localhost:5080',
      '/health': 'http://localhost:5080',
    },
  },
  build: {
    outDir: '../server/wwwroot',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          mantine: ['@mantine/core', '@mantine/hooks', '@mantine/form', '@mantine/notifications'],
          tanstack: ['@tanstack/react-query', '@tanstack/react-router'],
        },
      },
    },
  },
});
