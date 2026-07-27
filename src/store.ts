import { create } from 'zustand';
import { boot, type BootData } from './boot';
import { loadConfig, saveConfig, wipeLocalData, type AppConfig } from './db/repo';
import { Meta } from './engine/meta';
import { initialPull, syncAll, type PullProgress, type PullResult } from './sync/pull';

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

  /** Läuft gerade eine Replikation? Fortschritt für die Anzeige. */
  syncing: boolean;
  progress: PullProgress | null;
  lastSync: PullResult[] | null;
  syncError: string | null;
  /** Zähler, der bei jeder abgeschlossenen Replikation steigt — Seiten laden neu. */
  dataVersion: number;

  init: () => Promise<void>;
  connect: (config: AppConfig) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setOnline: (online: boolean) => void;
  navigate: (view: View) => void;

  replicate: (entityType: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  status: 'starting',
  config: null,
  data: null,
  error: null,
  online: navigator.onLine,
  view: { name: 'home' },
  syncing: false,
  progress: null,
  lastSync: null,
  syncError: null,
  dataVersion: 0,

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
      // Automatischer Delta-Pull beim App-Start (PLAN.md Phase 4,3). Entitäten
      // ohne Erstreplikation werden dabei übersprungen.
      void get().syncNow();
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

  /** Erstreplikation einer Entität (vollständig paginiert). */
  async replicate(entityType) {
    const { config, data } = get();
    if (!config || !data || get().syncing) return;

    set({ syncing: true, syncError: null, progress: null });
    try {
      const result = await initialPull(config, new Meta(data), entityType, (progress) =>
        set({ progress }),
      );
      set((s) => ({ lastSync: [result], dataVersion: s.dataVersion + 1 }));
    } catch (err) {
      set({ syncError: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ syncing: false, progress: null });
    }
  },

  /** Delta für alle bereits replizierten Entitäten. */
  async syncNow() {
    const { config, data, online } = get();
    if (!config || !data || !online || get().syncing) return;

    set({ syncing: true, syncError: null, progress: null });
    try {
      const results = await syncAll(config, new Meta(data), data.scopeEntities, (progress) =>
        set({ progress }),
      );
      set((s) => ({ lastSync: results, dataVersion: s.dataVersion + 1 }));
    } catch (err) {
      set({ syncError: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ syncing: false, progress: null });
    }
  },
}));
