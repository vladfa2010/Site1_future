import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // оба стека — как у web
    // фиксированный порт 1002 (strictPort — не перескакивает)
    port: 1002,
    strictPort: true,
    proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' },
  },
});
