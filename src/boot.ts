import {
  EspoClient,
  EspoNetworkError,
  type AppUserResponse,
  type EspoMetadata,
  type I18nData,
  type LayoutName,
} from './api/espoClient';
import { MetaKeys } from './db/schema';
import { getMeta, getMetaRow, putMeta, type AppConfig } from './db/repo';

/**
 * Boot-Sequenz (PLAN.md Phase 1,3):
 * - online  → Metadata, I18n, App/user (enthält Settings + Sprache) und die
 *             Layouts der Scope-Entitäten laden und in `meta` persistieren
 * - offline → denselben Zustand aus `meta` herstellen
 *
 * Die App startet in beiden Fällen mit identischer Datenstruktur; der
 * Unterschied ist nur, wie alt der Stand ist.
 */

const LAYOUT_NAMES: LayoutName[] = ['detail', 'list'];

export interface BootData {
  appUser: AppUserResponse;
  metadata: EspoMetadata;
  i18n: I18nData;
  layouts: Record<string, unknown>;
  scopeEntities: string[];
  /** Woher der Zustand stammt und wie alt er ist. */
  source: 'network' | 'cache';
  loadedAt: string | null;
}

export class BootError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'BootError';
  }
}

/** Lädt alles Nötige vom Server und legt es im meta-Store ab. */
export async function bootFromNetwork(config: AppConfig): Promise<BootData> {
  const client = new EspoClient(config.auth);

  // Reihenfolge egal, also parallel — spart beim Kaltstart spürbar Zeit.
  const [appUser, metadata, i18n] = await Promise.all([
    client.appUser(),
    client.metadata(),
    client.i18n(),
  ]);

  const layouts: Record<string, unknown> = {};
  await Promise.all(
    config.scopeEntities.flatMap((entityType) =>
      LAYOUT_NAMES.map(async (name) => {
        const key = MetaKeys.layout(entityType, name);
        try {
          layouts[key] = await client.layout(entityType, name);
        } catch (err) {
          // Ein fehlendes Layout darf den Boot nicht verhindern — die Engine
          // fällt in Phase 2 auf die Feldliste aus entityDefs zurück.
          console.warn(`Layout ${entityType}/${name} nicht ladbar:`, err);
        }
      }),
    ),
  );

  const loadedAt = new Date().toISOString();
  await Promise.all([
    putMeta(MetaKeys.appUser, appUser),
    putMeta(MetaKeys.metadata, metadata),
    putMeta(MetaKeys.i18n, i18n),
    putMeta(MetaKeys.settings, appUser.settings ?? {}),
    putMeta(MetaKeys.lastBootAt, loadedAt),
    ...Object.entries(layouts).map(([key, value]) => putMeta(key, value)),
  ]);

  return {
    appUser,
    metadata,
    i18n,
    layouts,
    scopeEntities: config.scopeEntities,
    source: 'network',
    loadedAt,
  };
}

/** Stellt den zuletzt geladenen Zustand aus IndexedDB her. */
export async function bootFromCache(config: AppConfig): Promise<BootData> {
  const [appUser, metadata, i18n] = await Promise.all([
    getMeta<AppUserResponse>(MetaKeys.appUser),
    getMeta<EspoMetadata>(MetaKeys.metadata),
    getMeta<I18nData>(MetaKeys.i18n),
  ]);

  if (!appUser || !metadata || !i18n) {
    throw new BootError(
      'Kein vollständiger Cache vorhanden. Für den ersten Start wird eine Verbindung benötigt.',
    );
  }

  const layouts: Record<string, unknown> = {};
  await Promise.all(
    config.scopeEntities.flatMap((entityType) =>
      LAYOUT_NAMES.map(async (name) => {
        const key = MetaKeys.layout(entityType, name);
        const value = await getMeta(key);
        if (value !== undefined) layouts[key] = value;
      }),
    ),
  );

  const row = await getMetaRow(MetaKeys.appUser);
  return {
    appUser,
    metadata,
    i18n,
    layouts,
    scopeEntities: config.scopeEntities,
    source: 'cache',
    loadedAt: (await getMeta<string>(MetaKeys.lastBootAt)) ?? row?.updatedAt ?? null,
  };
}

/**
 * Bootet bevorzugt aus dem Netz und fällt bei fehlender Verbindung auf den
 * Cache zurück. Ein Netzwerkfehler ist dabei kein Abbruchgrund — genau das
 * ist der Offline-Fall.
 */
export async function boot(config: AppConfig): Promise<BootData> {
  if (navigator.onLine) {
    try {
      return await bootFromNetwork(config);
    } catch (err) {
      if (!(err instanceof EspoNetworkError)) throw err;
      console.warn('Netzwerk nicht erreichbar, boote aus dem Cache:', err);
    }
  }
  return bootFromCache(config);
}
