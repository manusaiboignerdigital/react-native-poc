import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// App-Shell für den Kaltstart ohne Netz. Nur im Build — im Dev-Betrieb würde
// der Service Worker HMR in die Quere kommen. Vollausbau in Phase 6.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void (async () => {
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;
      // Die bereits geladenen Bundles nachmelden — sie kamen an, bevor der
      // Worker die Kontrolle hatte, und fehlen sonst beim Offline-Kaltstart.
      const assets = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.startsWith(location.origin) && /\.(js|css|woff2?)$/.test(url));
      registration.active?.postMessage({ type: 'precache', assets });
    })();
  });
}
