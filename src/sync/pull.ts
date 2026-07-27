import { EspoClient, EspoHttpError } from '../api/espoClient';
import { db } from '../db/schema';
import { upsertRecords, type AppConfig } from '../db/repo';
import type { Meta } from '../engine/meta';

/**
 * Replikation vom Server (Pull).
 *
 * Parameter laut docs/API-NOTES.md:
 * - `orderBy=modifiedAt&order=asc` (Projektvorgabe). `modifiedAt` ist auf
 *   dieser Instanz nicht eindeutig — 10.000 Seed-Datensätze tragen `null`.
 *   Gegenmaßnahme: Upserts sind idempotent, und nach dem Initial-Pull wird die
 *   lokale Anzahl gegen `total` geprüft.
 * - `maxSize` bis 5000 möglich; 500 als Kompromiss zwischen Requests und Speicher.
 * - Delta über `where[0][type]=after` auf `modifiedAt`, Format `YYYY-MM-DD HH:MM:SS`
 *   in UTC. `after` ist exklusiv, deshalb die Überlappung unten.
 *
 * **Bekannte Lücke (bewusst nicht gebaut, PLAN.md Phase 4,4):** Löschungen und
 * ACL-Entzug sind über einen Delta-Pull unsichtbar — ein gelöschter Datensatz
 * taucht in keiner Liste mehr auf, bleibt lokal aber liegen. Lösung später über
 * einen periodischen ID-Abgleich (nur IDs paginiert ziehen und lokal diffen)
 * oder einen serverseitigen Custom-Endpoint bzw. Webhooks.
 */

export const PAGE_SIZE = 500;

/** Überlappung gegen Uhrendrift zwischen Client und Server. */
const OVERLAP_MINUTES = 2;

export interface ListResponse {
  total: number;
  list: Record<string, unknown>[];
}

export interface PullProgress {
  entityType: string;
  loaded: number;
  total: number;
  phase: 'initial' | 'delta';
}

export interface PullResult {
  entityType: string;
  loaded: number;
  total: number;
  /** Übersprungen, weil noch keine Erstreplikation gelaufen ist. */
  skipped?: boolean;
  /** Lokaler Bestand weicht von `total` ab (siehe Sortier-Hinweis oben). */
  mismatch?: boolean;
}

/**
 * `select` aus den Layouts: alle dort verwendeten Felder plus die
 * Beziehungsattribute. Ohne `select` liefert Espo nur einen Standardausschnitt;
 * die Engine braucht aber genau die Felder, die das Layout zeigt.
 */
export function buildSelect(meta: Meta, entityType: string): string[] {
  const fields = new Set<string>(['id', 'name', 'modifiedAt', 'createdAt']);

  const layoutFields = [
    ...meta.detailLayout(entityType).flatMap((panel) =>
      panel.rows.flatMap((row) => row.filter((cell) => cell !== false).map((cell) => (cell as { name: string }).name)),
    ),
    ...meta.listLayout(entityType).map((column) => column.name),
  ];

  for (const name of layoutFields) {
    const def = meta.fieldDef(entityType, name);
    switch (def?.type) {
      case 'link':
        fields.add(`${name}Id`);
        fields.add(`${name}Name`);
        break;
      case 'linkMultiple':
        fields.add(`${name}Ids`);
        fields.add(`${name}Names`);
        break;
      case undefined:
        break; // unbekanntes Feld nicht anfordern
      default:
        fields.add(name);
    }
  }

  return [...fields];
}

/**
 * Espo lehnt unbekannte `select`-Attribute mit HTTP 400 ab. `versionNumber`
 * ist kein reguläres Feld, wird aber für die Konfliktprüfung beim Push
 * (Phase 5) gebraucht — deshalb ein Versuch mit Rückfall statt Blindflug.
 */
let versionNumberSelectable: boolean | null = null;

async function fetchPage(
  client: EspoClient,
  entityType: string,
  select: string[],
  params: Record<string, unknown>,
): Promise<ListResponse> {
  const withVersion = versionNumberSelectable !== false;
  const selectList = withVersion ? [...select, 'versionNumber'] : select;

  try {
    const response = await client.request<ListResponse>(entityType, {
      params: { ...params, select: selectList.join(',') },
    });
    if (versionNumberSelectable === null) {
      // Beim ersten Erfolg festhalten, ob die Version wirklich mitkam.
      versionNumberSelectable = response.list?.some((r) => 'versionNumber' in r) ?? false;
      if (!versionNumberSelectable) {
        console.info('[pull] versionNumber wird von der Liste nicht geliefert — Push nutzt sie erst nach dem Nachladen des Datensatzes.');
      }
    }
    return response;
  } catch (error) {
    if (withVersion && error instanceof EspoHttpError && error.status === 400) {
      console.warn('[pull] select mit versionNumber abgelehnt, wiederhole ohne.', error.reason);
      versionNumberSelectable = false;
      return client.request<ListResponse>(entityType, {
        params: { ...params, select: select.join(',') },
      });
    }
    throw error;
  }
}

/** Größtes `modifiedAt` einer Seite (Seed-Datensätze tragen `null`). */
function maxModifiedAt(rows: Record<string, unknown>[], current: string | null): string | null {
  return rows.reduce((max, row) => {
    const value = row.modifiedAt;
    return typeof value === 'string' && (max === null || value > max) ? value : max;
  }, current);
}

/** Zieht seitenweise, bis `total` erreicht ist. */
async function paginate(
  config: AppConfig,
  entityType: string,
  select: string[],
  extraParams: Record<string, unknown>,
  phase: 'initial' | 'delta',
  onProgress?: (progress: PullProgress) => void,
): Promise<{ loaded: number; total: number; newest: string | null }> {
  const client = new EspoClient(config.auth);
  let offset = 0;
  let total = 0;
  let loaded = 0;
  let newest: string | null = null;

  for (;;) {
    const response = await fetchPage(client, entityType, select, {
      ...extraParams,
      maxSize: PAGE_SIZE,
      offset,
      orderBy: 'modifiedAt',
      order: 'asc',
    });

    const rows = response.list ?? [];
    total = response.total ?? rows.length;
    if (!rows.length) break;

    await upsertRecords(entityType, rows);
    newest = maxModifiedAt(rows, newest);
    loaded += rows.length;
    offset += rows.length;
    onProgress?.({ entityType, loaded, total, phase });

    if (offset >= total) break;
  }

  return { loaded, total, newest };
}

/** Vollständige Erstreplikation einer Entität. */
export async function initialPull(
  config: AppConfig,
  meta: Meta,
  entityType: string,
  onProgress?: (progress: PullProgress) => void,
): Promise<PullResult> {
  const select = buildSelect(meta, entityType);
  const { loaded, total, newest } = await paginate(
    config,
    entityType,
    select,
    {},
    'initial',
    onProgress,
  );

  const recordCount = await db.records.where('entityType').equals(entityType).count();

  await db.syncState.put({
    entityType,
    lastSyncedModifiedAt: newest,
    lastSyncAt: new Date().toISOString(),
    recordCount,
  });

  return { entityType, loaded, total, mismatch: recordCount !== total };
}

/** Espo-Zeitformat 'YYYY-MM-DD HH:MM:SS' (UTC), um Minuten zurückversetzt. */
export function shiftBackMinutes(timestamp: string, minutes: number): string {
  const asIso = `${timestamp.replace(' ', 'T')}Z`;
  const shifted = new Date(new Date(asIso).getTime() - minutes * 60_000);
  return shifted.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Delta-Replikation seit dem letzten Stand. Ohne vorherige Erstreplikation
 * wird nichts geholt — sonst entstünde eine Lücke, die nie mehr auffällt.
 */
export async function deltaPull(
  config: AppConfig,
  meta: Meta,
  entityType: string,
  onProgress?: (progress: PullProgress) => void,
): Promise<PullResult> {
  const state = await db.syncState.get(entityType);
  if (!state?.lastSyncedModifiedAt) {
    return { entityType, loaded: 0, total: state?.recordCount ?? 0, skipped: true };
  }

  // `after` ist exklusiv; die Überlappung fängt Uhrendrift ab. Doppelt
  // geholte Datensätze sind unkritisch, weil Upserts idempotent sind.
  const since = shiftBackMinutes(state.lastSyncedModifiedAt, OVERLAP_MINUTES);
  const select = buildSelect(meta, entityType);

  const { loaded, total, newest } = await paginate(
    config,
    entityType,
    select,
    { where: [{ type: 'after', attribute: 'modifiedAt', value: since }] },
    'delta',
    onProgress,
  );

  const recordCount = await db.records.where('entityType').equals(entityType).count();

  await db.syncState.put({
    entityType,
    // Nur vorrücken, nie zurück — sonst würden Änderungen übersprungen.
    lastSyncedModifiedAt:
      newest && newest > state.lastSyncedModifiedAt ? newest : state.lastSyncedModifiedAt,
    lastSyncAt: new Date().toISOString(),
    recordCount,
  });

  return { entityType, loaded, total };
}

/** Delta für alle bereits replizierten Entitäten (App-Start, `online`-Event). */
export async function syncAll(
  config: AppConfig,
  meta: Meta,
  entityTypes: string[],
  onProgress?: (progress: PullProgress) => void,
): Promise<PullResult[]> {
  const results: PullResult[] = [];
  for (const entityType of entityTypes) {
    results.push(await deltaPull(config, meta, entityType, onProgress));
  }
  return results;
}

/** Einzelnen Datensatz frisch holen (Detailansicht, volle Feldmenge). */
export async function fetchRecord(
  config: AppConfig,
  entityType: string,
  id: string,
): Promise<Record<string, unknown>> {
  const client = new EspoClient(config.auth);
  const record = await client.request<Record<string, unknown>>(`${entityType}/${id}`);
  await upsertRecords(entityType, [record]);
  return record;
}
