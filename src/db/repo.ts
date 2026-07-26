import { db, MetaKeys, type MetaRow, type RecordRow } from './schema';
import type { AuthConfig } from '../api/espoClient';

/**
 * Zugriffsschicht auf die lokale Datenbank. Alles, was sonst direkt Dexie
 * ansprechen würde, läuft hier durch.
 */

// --- meta ---

export async function putMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function getMetaRow(key: string): Promise<MetaRow | undefined> {
  return db.meta.get(key);
}

export async function metaKeys(): Promise<string[]> {
  return db.meta.toCollection().primaryKeys();
}

// --- Konfiguration ---

/**
 * TODO (Produktion): Das Token liegt im Klartext in IndexedDB und ist damit
 * für jedes Skript auf der Origin lesbar. Für den Prototyp akzeptiert; härten
 * ließe sich das über kurzlebige Tokens, Web Crypto mit nutzergebundenem
 * Schlüssel oder einen Auth-Proxy, der HttpOnly-Cookies setzt.
 */
export interface AppConfig {
  auth: AuthConfig;
  /** Entitäten, die repliziert und angezeigt werden. */
  scopeEntities: string[];
}

export function saveConfig(config: AppConfig) {
  return putMeta(MetaKeys.config, config);
}

export function loadConfig() {
  return getMeta<AppConfig>(MetaKeys.config);
}

export async function clearConfig() {
  await db.meta.delete(MetaKeys.config);
}

/** Setzt die gesamte lokale Datenbank zurück (Abmelden). */
export async function wipeLocalData() {
  await db.transaction('rw', db.meta, db.records, db.outbox, db.idMap, db.syncState, async () => {
    await Promise.all([
      db.meta.clear(),
      db.records.clear(),
      db.outbox.clear(),
      db.idMap.clear(),
      db.syncState.clear(),
    ]);
  });
}

// --- records (ab Phase 4 befüllt) ---

export async function upsertRecords(entityType: string, rows: Record<string, unknown>[]) {
  const mapped: RecordRow[] = rows.map((data) => ({
    entityType,
    id: String(data.id),
    data,
    modifiedAt: (data.modifiedAt as string | null) ?? null,
    versionNumber: (data.versionNumber as number | undefined) ?? null,
  }));
  await db.records.bulkPut(mapped);
}

export function getRecord(entityType: string, id: string) {
  return db.records.get({ entityType, id });
}

export function countRecords(entityType: string) {
  return db.records.where('entityType').equals(entityType).count();
}

export function listRecords(entityType: string, limit = 50) {
  return db.records.where('entityType').equals(entityType).limit(limit).toArray();
}

// --- Outbox (ab Phase 5 befüllt) ---

export function countPendingOutbox() {
  return db.outbox.where('status').anyOf('pending', 'error', 'conflict').count();
}
