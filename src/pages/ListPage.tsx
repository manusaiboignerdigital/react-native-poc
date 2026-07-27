import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { Meta } from '../engine/meta';
import { ListView } from '../engine/ListView';
import { countRecords, listRecords } from '../db/repo';

/** Obergrenze der angezeigten Datensätze — die Instanz hält über 10.000. */
const DISPLAY_LIMIT = 500;

export function ListPage({ entityType }: { entityType: string }) {
  const data = useApp((s) => s.data)!;
  const navigate = useApp((s) => s.navigate);
  const online = useApp((s) => s.online);
  const syncing = useApp((s) => s.syncing);
  const progress = useApp((s) => s.progress);
  const dataVersion = useApp((s) => s.dataVersion);
  const replicate = useApp((s) => s.replicate);

  const meta = useMemo(() => new Meta(data), [data]);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const rows = await listRecords(entityType, DISPLAY_LIMIT);
    setRecords(rows.map((row) => row.data));
    setTotal(await countRecords(entityType));
  }, [entityType]);

  // Nach jeder Replikation neu laden.
  useEffect(() => {
    void load();
  }, [load, dataVersion]);

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
            <span className="muted">
              ({total} lokal
              {total > DISPLAY_LIMIT && `, ${DISPLAY_LIMIT} angezeigt`})
            </span>
          </h2>
          <button onClick={() => void replicate(entityType)} disabled={syncing || !online}>
            {syncing ? 'Repliziere …' : 'Alle Datensätze laden'}
          </button>
        </div>

        {!online && <p className="muted">Offline — es wird der lokale Bestand angezeigt.</p>}
        {progress?.entityType === entityType && (
          <p className="muted">
            {progress.loaded} von {progress.total}
            <progress value={progress.loaded} max={progress.total || 1} />
          </p>
        )}

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
