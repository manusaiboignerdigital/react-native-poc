import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { countRecords, metaKeys } from '../db/repo';
import { db } from '../db/schema';
import type { SyncStateRow } from '../db/schema';
import type { BootData } from '../boot';

/** Label einer Entität aus der I18n, sonst der technische Name. */
function entityLabel(data: BootData, entityType: string): string {
  const scope = data.i18n[entityType] as { label?: string } | undefined;
  const global = data.i18n.Global as { scopeNames?: Record<string, string> } | undefined;
  return global?.scopeNames?.[entityType] ?? scope?.label ?? entityType;
}

function fieldCount(data: BootData, entityType: string): number {
  return Object.keys(data.metadata.entityDefs?.[entityType]?.fields ?? {}).length;
}

const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('de-DE') : '—';

export function HomePage() {
  const data = useApp((s) => s.data)!;
  const refresh = useApp((s) => s.refresh);
  const logout = useApp((s) => s.logout);
  const status = useApp((s) => s.status);
  const navigate = useApp((s) => s.navigate);
  const online = useApp((s) => s.online);
  const syncing = useApp((s) => s.syncing);
  const progress = useApp((s) => s.progress);
  const lastSync = useApp((s) => s.lastSync);
  const syncError = useApp((s) => s.syncError);
  const dataVersion = useApp((s) => s.dataVersion);
  const replicate = useApp((s) => s.replicate);
  const syncNow = useApp((s) => s.syncNow);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [syncState, setSyncState] = useState<Record<string, SyncStateRow>>({});
  const [cachedKeys, setCachedKeys] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      const entries = await Promise.all(
        data.scopeEntities.map(async (e) => [e, await countRecords(e)] as const),
      );
      setCounts(Object.fromEntries(entries));
      setSyncState(Object.fromEntries((await db.syncState.toArray()).map((s) => [s.entityType, s])));
      setCachedKeys(await metaKeys());
    })();
  }, [data, dataVersion, syncing]);

  const user = data.appUser.user;

  return (
    <main>
      <section className="card">
        <h2>Angemeldet</h2>
        <dl>
          <dt>Nutzer</dt>
          <dd>
            <strong>{user.name ?? user.userName}</strong> ({user.userName})
          </dd>
          <dt>Sprache</dt>
          <dd>{data.appUser.language ?? '—'}</dd>
          <dt>Datenstand</dt>
          <dd>
            {data.source === 'network' ? 'frisch vom Server' : 'aus dem lokalen Cache'}
            {data.loadedAt && ` · ${new Date(data.loadedAt).toLocaleString('de-DE')}`}
          </dd>
        </dl>
        <div className="actions">
          <button onClick={() => void refresh()} disabled={status === 'booting'}>
            {status === 'booting' ? 'Lade …' : 'Metadaten neu laden'}
          </button>
          <button className="secondary" onClick={() => void logout()}>
            Abmelden und lokale Daten löschen
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Replikation</h2>
          <button onClick={() => void syncNow()} disabled={syncing || !online}>
            {syncing ? 'Synchronisiere …' : 'Jetzt synchronisieren'}
          </button>
        </div>

        {!online && <p className="muted">Offline — Synchronisieren ist nicht möglich.</p>}
        {progress && (
          <p className="muted">
            {progress.phase === 'initial' ? 'Erstreplikation' : 'Delta'} {progress.entityType}:{' '}
            {progress.loaded} von {progress.total}
            <progress value={progress.loaded} max={progress.total || 1} />
          </p>
        )}
        {syncError && <p className="error">{syncError}</p>}
        {lastSync && !syncing && (
          <p className="muted">
            {lastSync
              .map((r) =>
                r.skipped
                  ? `${r.entityType}: noch nicht repliziert`
                  : `${r.entityType}: ${r.loaded} übertragen${r.mismatch ? ' ⚠︎ Anzahl weicht ab' : ''}`,
              )
              .join(' · ')}
          </p>
        )}

        <table>
          <thead>
            <tr>
              <th>Entität</th>
              <th>Felder</th>
              <th>Layouts</th>
              <th>Lokal</th>
              <th>Letzter Sync</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.scopeEntities.map((entityType) => {
              const layouts = ['detail', 'list'].filter(
                (n) => data.layouts[`layout:${entityType}:${n}`] !== undefined,
              );
              const state = syncState[entityType];
              return (
                <tr key={entityType}>
                  <td>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => navigate({ name: 'list', entityType })}
                    >
                      <strong>{entityLabel(data, entityType)}</strong>
                    </button>
                    <br />
                    <code>{entityType}</code>
                  </td>
                  <td>{fieldCount(data, entityType)}</td>
                  <td>{layouts.length ? layouts.join(', ') : <em>keine</em>}</td>
                  <td>{counts[entityType] ?? 0}</td>
                  <td className="small">
                    {formatTime(state?.lastSyncAt ?? null)}
                    {state?.lastSyncedModifiedAt && (
                      <>
                        <br />
                        <span className="muted">bis {state.lastSyncedModifiedAt}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => void replicate(entityType)}
                      disabled={syncing || !online}
                    >
                      {state ? 'Neu replizieren' : 'Erstreplikation'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="hint">
          Bekannte Lücke: Löschungen und ACL-Entzug sind über den Delta-Abgleich nicht
          sichtbar — betroffene Datensätze bleiben lokal bestehen.
        </p>
      </section>

      <section className="card">
        <h2>Lokaler Cache</h2>
        <p className="muted">
          {cachedKeys.length} Einträge im <code>meta</code>-Store:
        </p>
        <ul className="keys">
          {cachedKeys.map((key) => (
            <li key={key}>
              <code>{key}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
