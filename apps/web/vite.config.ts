import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // оба стека: localhost → 127.0.0.1 И ::1
    // фиксированный порт 1001 (strictPort — не перескакивает)
    port: 1001,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
