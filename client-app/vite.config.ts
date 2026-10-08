import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Sub-path when hosted (e.g. /Feedback-Form-App/client/); "/" locally.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' (not autoUpdate): a new app build must never reload the page while a visitor
      // is mid-form. The app applies the update itself when the kiosk is idle on the welcome screen.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Visitor Feedback',
        short_name: 'Feedback',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#fafaf9',
        theme_color: '#7a1f2b',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html',
        // API responses are cached by the app itself (IndexedDB), never by the service worker.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    port: 5174,
    strictPort: true,
    host: true, // reachable from phones / tablets on the same Wi-Fi
    proxy: { '/api': { target: 'http://127.0.0.1:4000' } },
  },
  preview: { port: 4174, host: true, proxy: { '/api': { target: 'http://127.0.0.1:4000' } } },
});
