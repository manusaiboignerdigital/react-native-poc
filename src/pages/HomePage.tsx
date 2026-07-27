import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { countRecords, metaKeys } from '../db/repo';
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

export function HomePage() {
  const data = useApp((s) => s.data)!;
  const refresh = useApp((s) => s.refresh);
  const logout = useApp((s) => s.logout);
  const status = useApp((s) => s.status);
  const navigate = useApp((s) => s.navigate);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cachedKeys, setCachedKeys] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      const entries = await Promise.all(
        data.scopeEntities.map(async (e) => [e, await countRecords(e)] as const),
      );
      setCounts(Object.fromEntries(entries));
      setCachedKeys(await metaKeys());
    })();
  }, [data]);

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
        <h2>Entitäten</h2>
        <table>
          <thead>
            <tr>
              <th>Entität</th>
              <th>Felder</th>
              <th>Layouts</th>
              <th>Datensätze lokal</th>
            </tr>
          </thead>
          <tbody>
            {data.scopeEntities.map((entityType) => {
              const layouts = ['detail', 'list'].filter(
                (n) => data.layouts[`layout:${entityType}:${n}`] !== undefined,
              );
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
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">
          Datensätze werden ab Phase 4 repliziert — hier zählt der lokale Bestand.
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
