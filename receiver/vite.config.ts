import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        homework: 'homework.html',
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
