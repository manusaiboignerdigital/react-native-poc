import Dexie, { type EntityTable } from 'dexie';

/**
 * Lokales Datenmodell (PLAN.md). Die Stores für Outbox, ID-Mapping und
 * Sync-Zustand werden erst in den Phasen 4/5 befüllt, sind aber jetzt schon
 * angelegt, damit später keine Schema-Migration nötig wird.
 *
 * Der Zugriff läuft ausschließlich über db/repo.ts — so bleibt ein späterer
 * Wechsel auf SQLite-WASM/OPFS eine lokale Änderung.
 */

/** metadata, i18n, appUser, settings, layout:{Entity}:{name}, config, … */
export interface MetaRow {
  key: string;
  value: unknown;
  /** Zeitpunkt der letzten Aktualisierung (ISO) — macht den Cache-Stand sichtbar. */
  updatedAt: string;
}

export interface RecordRow {
  entityType: string;
  id: string;
  data: Record<string, unknown>;
  /** Kopie aus data.modifiedAt für den Index; kann null sein (siehe API-NOTES). */
  modifiedAt: string | null;
  /** Version für die Konfliktprüfung beim Push (Phase 5). */
  versionNumber: number | null;
}

export type OutboxStatus = 'pending' | 'error' | 'conflict' | 'done';

export interface OutboxRow {
  seq?: number;
  tempId?: string;
  entityType: string;
  op: 'create' | 'update';
  payload: Record<string, unknown>;
  baseVersionNumber?: number;
  status: OutboxStatus;
  errorMsg?: string;
  createdAt: string;
}

export interface IdMapRow {
  tempId: string;
  serverId: string;
}

export interface SyncStateRow {
  entityType: string;
  lastSyncedModifiedAt: string | null;
  lastSyncAt: string | null;
  recordCount: number;
}

export class EspoDb extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;
  records!: EntityTable<RecordRow, 'id'>;
  outbox!: EntityTable<OutboxRow, 'seq'>;
  idMap!: EntityTable<IdMapRow, 'tempId'>;
  syncState!: EntityTable<SyncStateRow, 'entityType'>;

  constructor() {
    super('espo-offline');
    this.version(1).stores({
      meta: 'key',
      records: '[entityType+id], entityType, [entityType+modifiedAt], modifiedAt',
      outbox: '++seq, status, entityType, tempId',
      idMap: 'tempId, serverId',
      syncState: 'entityType',
    });
  }
}

export const db = new EspoDb();

/** Schlüssel im meta-Store — an einer Stelle, damit sie nicht auseinanderlaufen. */
export const MetaKeys = {
  config: 'config',
  metadata: 'metadata',
  i18n: 'i18n',
  appUser: 'appUser',
  settings: 'settings',
  lastBootAt: 'lastBootAt',
  layout: (entityType: string, name: string) => `layout:${entityType}:${name}`,
} as const;
