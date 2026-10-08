import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin API calls → the session cookie stays SameSite=Strict, no CORS needed.
    proxy: { '/api': { target: 'http://127.0.0.1:4000' } },
  },
  preview: { port: 4173, proxy: { '/api': { target: 'http://127.0.0.1:4000' } } },
});
