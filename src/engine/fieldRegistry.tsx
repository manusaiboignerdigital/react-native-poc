import { useEffect, useState, type ReactNode } from 'react';
import type { FieldDef } from '../api/espoClient';
import { searchRecords } from '../db/repo';
import type { Meta, RecordData } from './meta';

/**
 * fieldType → { Detail, Edit, validate }.
 *
 * Kein Renderer kennt einen konkreten Feldnamen; alles kommt aus den
 * Metadaten. Unbekannte Typen landen im Fallback-Renderer — auf dieser
 * Instanz betrifft das real `image` (und alles, was später dazukommt).
 */

export interface FieldSpec {
  entityType: string;
  name: string;
  def: FieldDef;
  label: string;
}

export interface DetailProps {
  spec: FieldSpec;
  record: RecordData;
  meta: Meta;
}

export interface EditProps extends DetailProps {
  /** Patch statt Einzelwert: link-Felder ändern gleichzeitig Id und Name. */
  onChange: (patch: RecordData) => void;
  readOnly?: boolean;
}

export interface FieldRenderer {
  Detail: (props: DetailProps) => ReactNode;
  Edit: (props: EditProps) => ReactNode;
  /** Rückgabe: Fehlermeldung oder null. */
  validate?: (spec: FieldSpec, record: RecordData) => string | null;
}

// --- gemeinsame Helfer ---

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === '' ||
  (Array.isArray(value) && value.length === 0);

function requiredCheck(spec: FieldSpec, value: unknown): string | null {
  if (spec.def.required && isEmpty(value)) return 'Pflichtfeld';
  return null;
}

function maxLengthCheck(spec: FieldSpec, value: unknown): string | null {
  const max = spec.def.maxLength;
  if (max && typeof value === 'string' && value.length > max) {
    return `Höchstens ${max} Zeichen`;
  }
  return null;
}

const Empty = () => <span className="empty">—</span>;

/** Textzeile im Detailmodus; leere Werte einheitlich als Strich. */
function TextOut({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === '' ? (
    <Empty />
  ) : (
    <span>{children}</span>
  );
}

// --- einfache Typen ---

const varcharRenderer: FieldRenderer = {
  Detail: ({ spec, record }) => <TextOut>{record[spec.name] as string}</TextOut>,
  Edit: ({ spec, record, onChange, readOnly }) => (
    <input
      value={(record[spec.name] as string) ?? ''}
      maxLength={spec.def.maxLength}
      readOnly={readOnly}
      onChange={(e) => onChange({ [spec.name]: e.target.value })}
    />
  ),
  validate: (spec, record) =>
    requiredCheck(spec, record[spec.name]) ?? maxLengthCheck(spec, record[spec.name]),
};

const textRenderer: FieldRenderer = {
  Detail: ({ spec, record }) => (
    <TextOut>
      {typeof record[spec.name] === 'string' ? (
        <span className="multiline">{record[spec.name] as string}</span>
      ) : null}
    </TextOut>
  ),
  Edit: ({ spec, record, onChange, readOnly }) => (
    <textarea
      rows={3}
      value={(record[spec.name] as string) ?? ''}
      readOnly={readOnly}
      onChange={(e) => onChange({ [spec.name]: e.target.value })}
    />
  ),
  validate: (spec, record) =>
    requiredCheck(spec, record[spec.name]) ?? maxLengthCheck(spec, record[spec.name]),
};

const boolRenderer: FieldRenderer = {
  Detail: ({ spec, record }) => <span>{record[spec.name] ? 'Ja' : 'Nein'}</span>,
  Edit: ({ spec, record, onChange, readOnly }) => (
    <input
      type="checkbox"
      className="check"
      checked={Boolean(record[spec.name])}
      disabled={readOnly}
      onChange={(e) => onChange({ [spec.name]: e.target.checked })}
    />
  ),
};

function numberRenderer(step: string): FieldRenderer {
  return {
    Detail: ({ spec, record }) => <TextOut>{record[spec.name] as number}</TextOut>,
    Edit: ({ spec, record, onChange, readOnly }) => (
      <input
        type="number"
        step={step}
        value={(record[spec.name] as number | null) ?? ''}
        readOnly={readOnly}
        onChange={(e) =>
          onChange({ [spec.name]: e.target.value === '' ? null : Number(e.target.value) })
        }
      />
    ),
    validate: (spec, record) => {
      const error = requiredCheck(spec, record[spec.name]);
      if (error) return error;
      const value = record[spec.name];
      if (value !== null && value !== undefined && value !== '' && Number.isNaN(Number(value))) {
        return 'Keine gültige Zahl';
      }
      return null;
    },
  };
}

/** Espo liefert Datum/Zeit als 'YYYY-MM-DD HH:MM:SS' — das Input-Element will ein T. */
const toInputDateTime = (value: unknown) =>
  typeof value === 'string' ? value.replace(' ', 'T').slice(0, 16) : '';
const fromInputDateTime = (value: string) =>
  value === '' ? null : `${value.replace('T', ' ')}:00`;

const dateRenderer: FieldRenderer = {
  Detail: ({ spec, record }) => {
    const value = record[spec.name];
    return (
      <TextOut>
        {typeof value === 'string' ? new Date(value).toLocaleDateString('de-DE') : null}
      </TextOut>
    );
  },
  Edit: ({ spec, record, onChange, readOnly }) => (
    <input
      type="date"
      value={(record[spec.name] as string) ?? ''}
      readOnly={readOnly}
      onChange={(e) => onChange({ [spec.name]: e.target.value || null })}
    />
  ),
  validate: (spec, record) => requiredCheck(spec, record[spec.name]),
};

const dateTimeRenderer: FieldRenderer = {
  Detail: ({ spec, record }) => {
    const value = record[spec.name];
    return (
      <TextOut>
        {typeof value === 'string'
          ? new Date(value.replace(' ', 'T') + 'Z').toLocaleString('de-DE')
          : null}
      </TextOut>
    );
  },
  Edit: ({ spec, record, onChange, readOnly }) => (
    <input
      type="datetime-local"
      value={toInputDateTime(record[spec.name])}
      readOnly={readOnly}
      onChange={(e) => onChange({ [spec.name]: fromInputDateTime(e.target.value) })}
    />
  ),
  validate: (spec, record) => requiredCheck(spec, record[spec.name]),
};

/** email/phone/url unterscheiden sich nur im Detail-Link und im input-Typ. */
function linkedTextRenderer(
  inputType: string,
  href: (value: string) => string,
  validateValue?: (value: string) => string | null,
): FieldRenderer {
  return {
    Detail: ({ spec, record }) => {
      const value = record[spec.name];
      if (typeof value !== 'string' || value === '') return <Empty />;
      return (
        <a href={href(value)} target="_blank" rel="noreferrer">
          {value}
        </a>
      );
    },
    Edit: ({ spec, record, onChange, readOnly }) => (
      <input
        type={inputType}
        value={(record[spec.name] as string) ?? ''}
        readOnly={readOnly}
        onChange={(e) => onChange({ [spec.name]: e.target.value })}
      />
    ),
    validate: (spec, record) => {
      const error = requiredCheck(spec, record[spec.name]) ?? maxLengthCheck(spec, record[spec.name]);
      if (error) return error;
      const value = record[spec.name];
      if (typeof value === 'string' && value !== '' && validateValue) return validateValue(value);
      return null;
    },
  };
}

// --- Auswahlfelder ---

const enumRenderer: FieldRenderer = {
  Detail: ({ spec, record, meta }) => {
    const value = record[spec.name];
    if (typeof value !== 'string' || value === '') return <Empty />;
    return <span className="chip">{meta.optionLabel(spec.entityType, spec.name, value)}</span>;
  },
  Edit: ({ spec, record, meta, onChange, readOnly }) => (
    <select
      value={(record[spec.name] as string) ?? ''}
      disabled={readOnly}
      onChange={(e) => onChange({ [spec.name]: e.target.value || null })}
    >
      <option value="">—</option>
      {meta.options(spec.entityType, spec.name).map((option) => (
        <option key={option} value={option}>
          {meta.optionLabel(spec.entityType, spec.name, option)}
        </option>
      ))}
    </select>
  ),
  validate: (spec, record) => requiredCheck(spec, record[spec.name]),
};

/**
 * Mehrfachauswahl: deckt `multiEnum`, `checklist` und `array` ab. `checklist`
 * ist auf dieser Instanz der häufigste dieser Typen (3 Felder in
 * CPruefberichte) und wird von der Dynamic Logic mit `has` abgefragt.
 */
const multiSelectRenderer: FieldRenderer = {
  Detail: ({ spec, record, meta }) => {
    const values = Array.isArray(record[spec.name]) ? (record[spec.name] as string[]) : [];
    if (!values.length) return <Empty />;
    return (
      <span className="chips">
        {values.map((value) => (
          <span key={value} className="chip">
            {meta.optionLabel(spec.entityType, spec.name, value)}
          </span>
        ))}
      </span>
    );
  },
  Edit: ({ spec, record, meta, onChange, readOnly }) => {
    const values = Array.isArray(record[spec.name]) ? (record[spec.name] as string[]) : [];
    const toggle = (option: string, on: boolean) =>
      onChange({
        [spec.name]: on ? [...values, option] : values.filter((v) => v !== option),
      });
    return (
      <div className="checkgroup">
        {meta.options(spec.entityType, spec.name).map((option) => (
          <label key={option} className="radio">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={values.includes(option)}
              onChange={(e) => toggle(option, e.target.checked)}
            />
            {meta.optionLabel(spec.entityType, spec.name, option)}
          </label>
        ))}
      </div>
    );
  },
  validate: (spec, record) => requiredCheck(spec, record[spec.name]),
};

// --- Beziehungen ---

/**
 * belongsTo: im Datensatz als `{link}Id` / `{link}Name` (A7). Die Auswahl im
 * Edit-Modus kommt aus dem lokalen Cache — offline soll sie genauso
 * funktionieren wie online.
 */
const linkRenderer: FieldRenderer = {
  Detail: ({ spec, record }) => {
    const name = record[`${spec.name}Name`];
    const id = record[`${spec.name}Id`];
    if (!id) return <Empty />;
    return <span className="chip">{(name as string) || (id as string)}</span>;
  },
  Edit: (props) => <LinkEdit {...props} />,
  validate: (spec, record) => requiredCheck(spec, record[`${spec.name}Id`]),
};

function LinkEdit({ spec, record, meta, onChange, readOnly }: EditProps) {
  const target = meta.linkTarget(spec.entityType, spec.name);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!target || !open) return;
    let cancelled = false;
    void searchRecords(target, query, 20).then((rows) => {
      if (!cancelled) setHits(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [target, query, open]);

  const currentName = (record[`${spec.name}Name`] as string) ?? '';
  const currentId = record[`${spec.name}Id`] as string | undefined;

  if (!target) {
    return <span className="muted">Ziel der Beziehung unbekannt</span>;
  }

  return (
    <div className="linkedit">
      <div className="linkedit-current">
        {currentId ? (
          <span className="chip">{currentName || currentId}</span>
        ) : (
          <span className="empty">—</span>
        )}
        {!readOnly && (
          <>
            {currentId && (
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  onChange({ [`${spec.name}Id`]: null, [`${spec.name}Name`]: null })
                }
              >
                entfernen
              </button>
            )}
            <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>
              {open ? 'schließen' : 'auswählen'}
            </button>
          </>
        )}
      </div>

      {open && !readOnly && (
        <div className="linkedit-search">
          <input
            placeholder={`${meta.entityLabel(target)} suchen …`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul>
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    onChange({ [`${spec.name}Id`]: hit.id, [`${spec.name}Name`]: hit.name });
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  {hit.name || hit.id}
                </button>
              </li>
            ))}
            {!hits.length && (
              <li className="muted">
                Keine Treffer im lokalen Bestand
                {query === '' && ' — Datensätze werden ab Phase 4 repliziert'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** hasMany: `{link}Ids` als Array, `{link}Names` als Map id → Name (A7). */
const linkMultipleRenderer: FieldRenderer = {
  Detail: ({ spec, record }) => {
    const ids = Array.isArray(record[`${spec.name}Ids`])
      ? (record[`${spec.name}Ids`] as string[])
      : [];
    if (!ids.length) return <Empty />;
    const names = (record[`${spec.name}Names`] ?? {}) as Record<string, string>;
    return (
      <span className="chips">
        {ids.map((id) => (
          <span key={id} className="chip">
            {names[id] ?? id}
          </span>
        ))}
      </span>
    );
  },
  // Für den Prototyp read-only: das Bearbeiten von n:m-Beziehungen ist in
  // PLAN.md als Nicht-Ziel ausgewiesen.
  Edit: (props) => (
    <div>
      {linkMultipleRenderer.Detail(props)}
      <div className="muted">nur lesend im Prototyp</div>
    </div>
  ),
};

// --- Währung (auf dieser Instanz nicht vorhanden, laut PLAN.md aber vorgesehen) ---

const currencyRenderer: FieldRenderer = {
  Detail: ({ spec, record }) => {
    const amount = record[spec.name];
    if (amount === null || amount === undefined || amount === '') return <Empty />;
    return (
      <span>
        {Number(amount).toLocaleString('de-DE', { minimumFractionDigits: 2 })}{' '}
        {(record[`${spec.name}Currency`] as string) ?? ''}
      </span>
    );
  },
  Edit: ({ spec, record, onChange, readOnly }) => (
    <span className="currency">
      <input
        type="number"
        step="0.01"
        value={(record[spec.name] as number | null) ?? ''}
        readOnly={readOnly}
        onChange={(e) =>
          onChange({ [spec.name]: e.target.value === '' ? null : Number(e.target.value) })
        }
      />
      <input
        className="currency-code"
        value={(record[`${spec.name}Currency`] as string) ?? ''}
        readOnly={readOnly}
        maxLength={3}
        onChange={(e) => onChange({ [`${spec.name}Currency`]: e.target.value })}
      />
    </span>
  ),
  validate: (spec, record) => requiredCheck(spec, record[spec.name]),
};

// --- Fallback ---

/**
 * Pflicht laut PLAN.md: die Engine darf an einem unbekannten Feldtyp nie
 * scheitern. Zeigt Rohwert und Typ, damit im Zweifel sichtbar ist, was fehlt.
 * Betrifft auf dieser Instanz `image` (Attachments sind ein Nicht-Ziel).
 */
export const fallbackRenderer: FieldRenderer = {
  Detail: ({ spec, record }) => {
    const value = record[spec.name];
    return (
      <span className="fallback">
        <code>{value === undefined || value === null ? '—' : JSON.stringify(value)}</code>
        <span className="type-badge">{spec.def.type}</span>
      </span>
    );
  },
  Edit: (props) => (
    <span className="fallback">
      {fallbackRenderer.Detail(props)}
      <span className="muted">nicht bearbeitbar</span>
    </span>
  ),
};

export const fieldRegistry: Record<string, FieldRenderer> = {
  varchar: varcharRenderer,
  text: textRenderer,
  // barcode verhält sich wie ein Textfeld (CEmayrQrs.qrCode).
  barcode: varcharRenderer,
  enum: enumRenderer,
  multiEnum: multiSelectRenderer,
  checklist: multiSelectRenderer,
  array: multiSelectRenderer,
  bool: boolRenderer,
  int: numberRenderer('1'),
  float: numberRenderer('any'),
  currency: currencyRenderer,
  date: dateRenderer,
  datetime: dateTimeRenderer,
  email: linkedTextRenderer('email', (v) => `mailto:${v}`, (v) =>
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Keine gültige E-Mail-Adresse',
  ),
  phone: linkedTextRenderer('tel', (v) => `tel:${v}`),
  url: linkedTextRenderer('url', (v) => (/^https?:\/\//.test(v) ? v : `https://${v}`)),
  link: linkRenderer,
  linkMultiple: linkMultipleRenderer,
};

export function rendererFor(type: string | undefined): FieldRenderer {
  return (type && fieldRegistry[type]) || fallbackRenderer;
}
