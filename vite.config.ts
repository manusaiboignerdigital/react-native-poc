import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Die Espo-Instanz sendet keine CORS-Header (Phase 0, A10). Die App spricht
 * deshalb immer den *relativen* Pfad /api/v1/... an; im Dev-Betrieb leitet
 * dieser Proxy dorthin weiter. In Produktion läuft die PWA unter derselben
 * Domain bzw. hinter demselben Reverse-Proxy — dann trägt der Pfad von selbst.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const target = env.VITE_ESPOCRM_URL;

  const proxy = target ? { '/api': { target, changeOrigin: true } } : undefined;

  return {
    plugins: [react()],
    server: { proxy },
    // `vite preview` dient dem Test des Builds — ohne denselben Proxy liefe es
    // dort in die CORS-Sperre.
    preview: { proxy },
  };
});
