import { create } from 'zustand';
import { boot, type BootData } from './boot';
import { loadConfig, saveConfig, wipeLocalData, type AppConfig } from './db/repo';

type Status = 'starting' | 'setup' | 'booting' | 'ready' | 'error';

/** Schlichtes Routing ohne Router-Bibliothek: Liste → Detail → Bearbeiten. */
export type View =
  | { name: 'home' }
  | { name: 'list'; entityType: string }
  | { name: 'detail'; entityType: string; id: string }
  | { name: 'edit'; entityType: string; id: string };

interface AppState {
  status: Status;
  config: AppConfig | null;
  data: BootData | null;
  error: string | null;
  online: boolean;
  view: View;

  init: () => Promise<void>;
  connect: (config: AppConfig) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setOnline: (online: boolean) => void;
  navigate: (view: View) => void;
}

export const useApp = create<AppState>((set, get) => ({
  status: 'starting',
  config: null,
  data: null,
  error: null,
  online: navigator.onLine,
  view: { name: 'home' },

  /** Beim App-Start: gespeicherte Konfiguration suchen und booten. */
  async init() {
    const config = await loadConfig();
    if (!config) {
      set({ status: 'setup' });
      return;
    }
    set({ config, status: 'booting', error: null });
    try {
      set({ data: await boot(config), status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  /** Erstmalige Einrichtung: Zugangsdaten speichern und laden. */
  async connect(config) {
    set({ status: 'booting', error: null });
    try {
      const data = await boot(config);
      await saveConfig(config);
      set({ config, data, status: 'ready' });
    } catch (err) {
      set({ status: 'setup', error: err instanceof Error ? err.message : String(err) });
    }
  },

  /** Manuelles Nachladen der Metadaten. */
  async refresh() {
    const { config } = get();
    if (!config) return;
    set({ status: 'booting', error: null });
    try {
      set({ data: await boot(config), status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  async logout() {
    await wipeLocalData();
    set({ status: 'setup', config: null, data: null, error: null, view: { name: 'home' } });
  },

  setOnline(online) {
    set({ online });
  },

  navigate(view) {
    set({ view });
  },
}));
