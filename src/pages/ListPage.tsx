import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { Meta } from '../engine/meta';
import { ListView } from '../engine/ListView';
import { countRecords, listRecords } from '../db/repo';
import { pullFirstPage } from '../sync/pull';

export function ListPage({ entityType }: { entityType: string }) {
  const data = useApp((s) => s.data)!;
  const config = useApp((s) => s.config)!;
  const navigate = useApp((s) => s.navigate);
  const online = useApp((s) => s.online);

  const meta = useMemo(() => new Meta(data), [data]);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await listRecords(entityType, 200);
    setRecords(rows.map((row) => row.data));
    setTotal(await countRecords(entityType));
  }, [entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function fetchFromServer() {
    setLoading(true);
    setError(null);
    try {
      await pullFirstPage(config, entityType);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <nav className="crumbs">
        <button className="link-btn" onClick={() => navigate({ name: 'home' })}>
          Übersicht
        </button>
        <span>›</span>
        <span>{meta.entityLabel(entityType)}</span>
      </nav>

      <section className="card">
        <div className="card-head">
          <h2>
            {meta.entityLabel(entityType)}{' '}
            <span className="muted">({total ?? 0} lokal)</span>
          </h2>
          <button onClick={() => void fetchFromServer()} disabled={loading || !online}>
            {loading ? 'Lade …' : 'Datensätze laden'}
          </button>
        </div>
        {!online && <p className="muted">Offline — es wird der lokale Bestand angezeigt.</p>}
        {error && <p className="error">{error}</p>}

        <ListView
          entityType={entityType}
          records={records}
          meta={meta}
          onOpen={(id) => navigate({ name: 'detail', entityType, id })}
        />
      </section>
    </main>
  );
}
