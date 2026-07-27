import type { BootData } from '../boot';
import type { FieldDef } from '../api/espoClient';

/**
 * Zugriff auf Metadaten, Layouts und Übersetzungen — die einzige Stelle, die
 * die Struktur der Espo-Metadaten kennt. Die Views arbeiten ausschließlich
 * gegen dieses Interface und enthalten deshalb keine Feldnamen.
 *
 * Belegte Pfade (docs/API-NOTES.md):
 *   entityDefs.{Entity}.fields.{field}          Feldtyp, options, required, maxLength
 *   entityDefs.{Entity}.links.{link}.entity     Zielentität einer Beziehung
 *   {Entity}.fields.{field}                     Feldlabel (I18n)
 *   {Entity}.options.{field}.{value}            Optionstext (enum UND checklist)
 *   Global.scopeNames.{Entity}                  Entitätsname
 */

export type RecordData = Record<string, unknown>;

export interface LayoutCell {
  name: string;
}

export interface LayoutPanel {
  label?: string;
  style?: string;
  /** Zellen können `false` sein — dann bleibt der Platz leer. */
  rows: (LayoutCell | false)[][];
}

export interface ListColumn {
  name: string;
  width?: number;
  link?: boolean;
  align?: string;
}

export class Meta {
  constructor(private boot: BootData) {}

  private entityDef(entityType: string) {
    return this.boot.metadata.entityDefs?.[entityType];
  }

  fieldDef(entityType: string, field: string): FieldDef | undefined {
    return this.entityDef(entityType)?.fields?.[field];
  }

  /** Alle Felder einer Entität — Grundlage des Layout-Fallbacks. */
  fieldNames(entityType: string): string[] {
    return Object.keys(this.entityDef(entityType)?.fields ?? {});
  }

  entityLabel(entityType: string): string {
    const global = this.boot.i18n.Global as { scopeNames?: Record<string, string> } | undefined;
    return global?.scopeNames?.[entityType] ?? entityType;
  }

  /**
   * Feldlabel. Kette: entitätsspezifisch → `Global.fields` → Feldname.
   * Standardfelder wie `modifiedAt` sind nur global übersetzt und blieben
   * ohne den zweiten Schritt technisch.
   */
  fieldLabel(entityType: string, field: string): string {
    const scoped = this.boot.i18n[entityType]?.fields?.[field];
    if (scoped) return scoped;
    const global = this.boot.i18n.Global as { fields?: Record<string, string> } | undefined;
    return global?.fields?.[field] ?? field;
  }

  /** Auswahlwerte eines enum-/checklist-/multiEnum-Feldes. */
  options(entityType: string, field: string): string[] {
    const options = this.fieldDef(entityType, field)?.options;
    return Array.isArray(options) ? options : [];
  }

  /**
   * Übersetzung eines Optionswertes. Kette: entitätsspezifisch → global →
   * Rohwert. Optionswerte können Leerzeichen und Umlaute enthalten
   * ("nicht geprüft"), taugen also nicht als Slug.
   */
  optionLabel(entityType: string, field: string, value: string): string {
    const scoped = this.boot.i18n[entityType]?.options?.[field]?.[value];
    if (scoped) return scoped;
    const global = this.boot.i18n.Global as
      | { options?: Record<string, Record<string, string>> }
      | undefined;
    return global?.options?.[field]?.[value] ?? value;
  }

  /** Zielentität einer Beziehung, z. B. cLieferschein → CLieferscheine. */
  linkTarget(entityType: string, field: string): string | undefined {
    const links = this.entityDef(entityType)?.links as
      | Record<string, { entity?: string }>
      | undefined;
    return links?.[field]?.entity;
  }

  private layout(entityType: string, name: 'detail' | 'list'): unknown {
    return this.boot.layouts[`layout:${entityType}:${name}`];
  }

  /**
   * Detail-Layout aus dem Cache. Fehlt es, wird eines aus den entityDefs
   * gebaut — die Engine soll auch dann rendern, wenn ein Layout nicht
   * abrufbar war (der Boot toleriert das bewusst).
   */
  detailLayout(entityType: string): LayoutPanel[] {
    const layout = this.layout(entityType, 'detail');
    if (Array.isArray(layout) && layout.length) return layout as LayoutPanel[];
    return [
      {
        label: undefined,
        rows: this.fieldNames(entityType)
          .filter((name) => !this.fieldDef(entityType, name)?.notStorable)
          .map((name) => [{ name }]),
      },
    ];
  }

  listLayout(entityType: string): ListColumn[] {
    const layout = this.layout(entityType, 'list');
    if (Array.isArray(layout) && layout.length) return layout as ListColumn[];
    return [{ name: 'name', link: true }, { name: 'modifiedAt' }];
  }
}
