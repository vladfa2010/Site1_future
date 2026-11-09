import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // оба стека — как у web
    // 5274 — чтобы не конфликтовать с PULSE (5174 может быть занят соседним dev)
    port: 5274,
    strictPort: true,
    proxy: { '/api': 'http://localhost:4100', '/uploads': 'http://localhost:4100' },
  },
});
