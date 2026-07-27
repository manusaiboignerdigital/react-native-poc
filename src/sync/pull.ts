import { EspoClient } from '../api/espoClient';
import { db } from '../db/schema';
import { upsertRecords, type AppConfig } from '../db/repo';

/**
 * Replikation vom Server (Pull).
 *
 * **Stand Phase 2:** nur eine erste Seite, damit die Rendering-Engine echte
 * Daten zu zeigen hat. Die vollständige Paginierung (`initialPull`), der
 * Delta-Abgleich über `modifiedAt` und die Sync-Oberfläche folgen in Phase 4 —
 * die hier festgelegten Parameter gelten dort weiter:
 *
 * - `orderBy=modifiedAt&order=asc` (Projektvorgabe; Risiko und Gegenmaßnahme
 *   siehe docs/API-NOTES.md, „Datenlage")
 * - `maxSize` bis 5000 möglich, 500 als Kompromiss
 * - `select` mit allen Layout-Feldern plus den `{link}Id`/`{link}Ids`-Attributen
 */

export const PAGE_SIZE = 500;

export interface ListResponse {
  total: number;
  list: Record<string, unknown>[];
}

/**
 * Holt die erste Seite einer Entität in den lokalen Bestand.
 * Rückgabe: Gesamtzahl auf dem Server und Anzahl übernommener Datensätze.
 */
export async function pullFirstPage(
  config: AppConfig,
  entityType: string,
  maxSize = 200,
): Promise<{ total: number; loaded: number }> {
  const client = new EspoClient(config.auth);

  const response = await client.request<ListResponse>(entityType, {
    params: {
      maxSize,
      offset: 0,
      orderBy: 'modifiedAt',
      order: 'asc',
    },
  });

  const list = response.list ?? [];
  await upsertRecords(entityType, list);

  await db.syncState.put({
    entityType,
    // Der Delta-Zeiger wird erst mit dem vollständigen Initial-Pull (Phase 4)
    // gesetzt — sonst würden die noch nicht geholten Seiten übersprungen.
    lastSyncedModifiedAt: null,
    lastSyncAt: new Date().toISOString(),
    recordCount: list.length,
  });

  return { total: response.total ?? list.length, loaded: list.length };
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
