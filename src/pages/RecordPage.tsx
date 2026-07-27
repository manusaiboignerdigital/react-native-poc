import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { Meta, type RecordData } from '../engine/meta';
import { DetailView } from '../engine/DetailView';
import { EditView } from '../engine/EditView';
import { getRecord, putRecord } from '../db/repo';
import { fetchRecord } from '../sync/pull';

/**
 * Detail- und Bearbeitungsansicht eines Datensatzes. Beide rendern aus
 * demselben Layout; der Unterschied liegt allein im Renderer-Modus.
 */
export function RecordPage({
  entityType,
  id,
  mode,
}: {
  entityType: string;
  id: string;
  mode: 'detail' | 'edit';
}) {
  const data = useApp((s) => s.data)!;
  const config = useApp((s) => s.config)!;
  const navigate = useApp((s) => s.navigate);
  const online = useApp((s) => s.online);

  const meta = useMemo(() => new Meta(data), [data]);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = await getRecord(entityType, id);
      if (!cancelled) setRecord(local?.data ?? null);

      // Der Listen-Request liefert nur die selektierten Attribute; für die
      // Detailansicht wird der vollständige Datensatz nachgeladen.
      if (navigator.onLine) {
        try {
          const fresh = await fetchRecord(config, entityType, id);
          if (!cancelled) setRecord(fresh);
        } catch {
          // offline oder nicht erreichbar — der lokale Stand genügt
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config, entityType, id]);

  async function save(changed: RecordData) {
    if (!record) return;
    setSaving(true);
    try {
      // Optimistisch lokal schreiben. Die Outbox-Operation und der Push zum
      // Server kommen in Phase 5 an genau dieser Stelle dazu.
      const merged = { ...record, ...changed };
      await putRecord(entityType, merged);
      setRecord(merged);
      setNotice(
        Object.keys(changed).length
          ? `${Object.keys(changed).length} Feld(er) lokal gespeichert — Sync folgt in Phase 5.`
          : 'Keine Änderungen.',
      );
      navigate({ name: 'detail', entityType, id });
    } finally {
      setSaving(false);
    }
  }

  if (!record) {
    return (
      <main>
        <section className="card">
          <p className="muted">
            Datensatz nicht im lokalen Bestand
            {online ? ' und nicht abrufbar.' : ' (offline).'}
          </p>
          <button onClick={() => navigate({ name: 'list', entityType })}>Zurück zur Liste</button>
        </section>
      </main>
    );
  }

  const title = (record.name as string) || String(record.id);

  return (
    <main>
      <nav className="crumbs">
        <button className="link-btn" onClick={() => navigate({ name: 'home' })}>
          Übersicht
        </button>
        <span>›</span>
        <button className="link-btn" onClick={() => navigate({ name: 'list', entityType })}>
          {meta.entityLabel(entityType)}
        </button>
        <span>›</span>
        <span>{title}</span>
      </nav>

      <section className="card">
        <div className="card-head">
          <h2>{title}</h2>
          {mode === 'detail' ? (
            <button onClick={() => navigate({ name: 'edit', entityType, id })}>Bearbeiten</button>
          ) : (
            <span className="muted">Bearbeiten</span>
          )}
        </div>
        {notice && <p className="muted">{notice}</p>}
      </section>

      {mode === 'detail' ? (
        <DetailView entityType={entityType} record={record} meta={meta} />
      ) : (
        <EditView
          entityType={entityType}
          record={record}
          meta={meta}
          saving={saving}
          onSave={save}
          onCancel={() => navigate({ name: 'detail', entityType, id })}
        />
      )}
    </main>
  );
}
