import { useMemo } from 'react';
import { rendererFor, type FieldSpec } from './fieldRegistry';
import type { Meta, RecordData } from './meta';

/**
 * Tabelle aus dem `list`-Layout. Sortierung client-seitig nach `modifiedAt`
 * (absteigend); Datensätze ohne `modifiedAt` landen hinten — auf dieser
 * Instanz betrifft das die per SQL eingespielten Testdaten.
 */
export function ListView({
  entityType,
  records,
  meta,
  onOpen,
}: {
  entityType: string;
  records: RecordData[];
  meta: Meta;
  onOpen: (id: string) => void;
}) {
  const columns = meta.listLayout(entityType);

  const sorted = useMemo(
    () =>
      [...records].sort((a, b) => {
        const left = (a.modifiedAt as string) ?? '';
        const right = (b.modifiedAt as string) ?? '';
        if (left === right) return String(a.id).localeCompare(String(b.id));
        if (!left) return 1;
        if (!right) return -1;
        return right.localeCompare(left);
      }),
    [records],
  );

  if (!records.length) {
    return <p className="muted">Keine Datensätze im lokalen Bestand.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.name} style={column.width ? { width: `${column.width}%` } : undefined}>
              {meta.fieldLabel(entityType, column.name)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((record) => (
          <tr key={String(record.id)}>
            {columns.map((column) => {
              const def = meta.fieldDef(entityType, column.name);
              const spec: FieldSpec = {
                entityType,
                name: column.name,
                def: def ?? { type: 'unknown' },
                label: meta.fieldLabel(entityType, column.name),
              };
              const content = rendererFor(def?.type).Detail({ spec, record, meta });

              return (
                <td key={column.name}>
                  {column.link ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => onOpen(String(record.id))}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
