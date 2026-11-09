import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // оба стека: localhost → 127.0.0.1 И ::1
    // 5273 — чтобы не конфликтовать с PULSE (5173)
    port: 5273,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4100',
    },
  },
});
