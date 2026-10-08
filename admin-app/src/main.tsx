import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* GitHub Pages has no SPA fallback, so the hosted build uses hash URLs (#/responses). */}
    {import.meta.env.VITE_HASH_ROUTER === 'true' ? (
      <HashRouter>
        <App />
      </HashRouter>
    ) : (
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
        <App />
      </BrowserRouter>
    )}
  </StrictMode>,
);
