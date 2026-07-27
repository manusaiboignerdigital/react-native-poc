import { rendererFor, type FieldSpec } from './fieldRegistry';
import type { Meta, RecordData } from './meta';

/**
 * Rendert einen Datensatz anhand des `detail`-Layouts: Panels → rows → cells.
 * Enthält keine Feldnamen — welche Felder erscheinen, entscheidet allein das
 * Layout aus dem Cache.
 */
export function DetailView({
  entityType,
  record,
  meta,
}: {
  entityType: string;
  record: RecordData;
  meta: Meta;
}) {
  return (
    <>
      {meta.detailLayout(entityType).map((panel, panelIndex) => (
        <section className="card" key={panel.label ?? panelIndex}>
          {panel.label && <h2>{panel.label}</h2>}
          <div className="fieldgrid">
            {panel.rows.flatMap((row, rowIndex) =>
              row.map((cell, cellIndex) => {
                // Leere Zellen sind im Layout als `false` kodiert.
                if (!cell) return <div key={`${rowIndex}-${cellIndex}`} className="field spacer" />;

                const def = meta.fieldDef(entityType, cell.name);
                const spec: FieldSpec = {
                  entityType,
                  name: cell.name,
                  def: def ?? { type: 'unknown' },
                  label: meta.fieldLabel(entityType, cell.name),
                };
                const renderer = rendererFor(def?.type);

                return (
                  <div className="field" key={`${rowIndex}-${cellIndex}-${cell.name}`}>
                    <div className="field-label">{spec.label}</div>
                    <div className="field-value">
                      {renderer.Detail({ spec, record, meta })}
                    </div>
                  </div>
                );
              }),
            )}
          </div>
        </section>
      ))}
    </>
  );
}
