import { useMemo, useState } from 'react';
import { rendererFor, type FieldSpec } from './fieldRegistry';
import { resolveFieldLogic } from './dynamicLogic';
import type { Meta, RecordData } from './meta';

/**
 * Formular auf Basis desselben `detail`-Layouts wie die DetailView.
 * Pflichtfelder, Optionen und Längenbegrenzungen stammen aus den entityDefs,
 * die Validierung aus dem jeweiligen Renderer der Registry.
 *
 * `readOnly`/`notStorable`-Felder werden gesperrt statt versteckt — so bleibt
 * das Layout erkennbar. Feldabhängige Sichtbarkeit kommt in Phase 3 dazu.
 */
export function EditView({
  entityType,
  record,
  meta,
  onSave,
  onCancel,
  saving,
}: {
  entityType: string;
  record: RecordData;
  meta: Meta;
  onSave: (changed: RecordData) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState<RecordData>(record);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const cells = useMemo(
    () =>
      meta
        .detailLayout(entityType)
        .flatMap((panel) =>
          panel.rows.flatMap((row) =>
            row.filter((cell): cell is { name: string } => Boolean(cell)),
          ),
        ),
    [entityType, meta],
  );

  // Dynamic Logic gegen den *aktuellen Entwurf* — dadurch wirkt jede
  // Feldänderung sofort auf Sichtbarkeit, Pflicht und Sperre der anderen Felder.
  const logic = useMemo(
    () => resolveFieldLogic(meta.fieldLogic(entityType), draft),
    [entityType, meta, draft],
  );

  const specFor = (name: string): FieldSpec => {
    const def = meta.fieldDef(entityType, name) ?? { type: 'unknown' };
    const dynamic = logic[name];
    return {
      entityType,
      name,
      // Dynamisch gefordert oder statisch pflichtig — beides zählt.
      def: dynamic ? { ...def, required: def.required || dynamic.required } : def,
      label: meta.fieldLabel(entityType, name),
    };
  };

  const isVisible = (name: string) => logic[name]?.visible !== false;
  const isLocked = (name: string) => {
    const def = meta.fieldDef(entityType, name);
    return Boolean(def?.readOnly || def?.notStorable || logic[name]?.readOnly);
  };

  function applyPatch(patch: RecordData) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function validateAll(): Record<string, string> {
    const found: Record<string, string> = {};
    for (const cell of cells) {
      // Ausgeblendete oder gesperrte Felder werden nicht geprüft — sonst
      // blockierte ein unsichtbares Pflichtfeld das Speichern unauflösbar.
      if (!isVisible(cell.name) || isLocked(cell.name)) continue;
      const spec = specFor(cell.name);
      const error = rendererFor(spec.def.type).validate?.(spec, draft);
      if (error) found[cell.name] = error;
    }
    return found;
  }

  function submit() {
    const found = validateAll();
    setErrors(found);
    if (Object.keys(found).length) return;

    // Nur geänderte Attribute übergeben — das hält den Payload klein und ist
    // die Grundlage für den Teil-Payload der Outbox in Phase 5.
    const changed: RecordData = {};
    for (const [key, value] of Object.entries(draft)) {
      if (JSON.stringify(value) !== JSON.stringify(record[key])) changed[key] = value;
    }
    void onSave(changed);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {meta.detailLayout(entityType).map((panel, panelIndex) => (
        <section className="card" key={panel.label ?? panelIndex}>
          {panel.label && <h2>{panel.label}</h2>}
          <div className="fieldgrid">
            {panel.rows.flatMap((row, rowIndex) =>
              row.map((cell, cellIndex) => {
                if (!cell) return <div key={`${rowIndex}-${cellIndex}`} className="field spacer" />;
                // Von der Dynamic Logic ausgeblendet
                if (!isVisible(cell.name)) return null;

                const spec = specFor(cell.name);
                const renderer = rendererFor(spec.def.type);
                const locked = isLocked(cell.name);
                const error = errors[cell.name];

                return (
                  <div className="field" key={`${rowIndex}-${cellIndex}-${cell.name}`}>
                    <div className="field-label">
                      {spec.label}
                      {spec.def.required && <span className="required" title="Pflichtfeld">*</span>}
                      {locked && <span className="lock" title="nicht bearbeitbar">🔒</span>}
                    </div>
                    <div className={error ? 'field-value has-error' : 'field-value'}>
                      {renderer.Edit({
                        spec,
                        record: draft,
                        meta,
                        onChange: applyPatch,
                        readOnly: locked,
                      })}
                      {error && <div className="error small">{error}</div>}
                    </div>
                  </div>
                );
              }),
            )}
          </div>
        </section>
      ))}

      <div className="actions sticky">
        <button type="submit" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Abbrechen
        </button>
        {Object.keys(errors).length > 0 && (
          <span className="error small">
            {Object.keys(errors).length} Feld(er) prüfen
          </span>
        )}
      </div>
    </form>
  );
}
