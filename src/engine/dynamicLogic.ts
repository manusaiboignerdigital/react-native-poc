import type { RecordData } from './meta';

/**
 * Evaluator für Espos `conditionGroup`.
 *
 * Quelle der Bedingungen ist `logicDefs.{Entity}.fields.{field}.{visible|
 * required|readOnly}.conditionGroup` (docs/API-NOTES.md, A8) — nicht allein
 * `clientDefs.dynamicLogic`, das auf dieser Instanz nur einen Bruchteil trägt.
 *
 * Beobachtete Form (aus fixtures/dynamic-logic-examples.json):
 * - `conditionGroup` ist immer ein Array; die Elemente sind UND-verknüpft.
 * - Vergleiche tragen `attribute` und meist `value`.
 * - `and`/`or` tragen unter `value` eine verschachtelte Liste.
 * - Ein zusätzliches `data.field` verweist nur auf das UI-Feld, zu dem das
 *   Attribut gehört (z. B. attribute `cKundenbaustelleId` → field
 *   `cKundenbaustelle`). Für die Auswertung ist allein `attribute` maßgeblich.
 */

export interface Condition {
  type: string;
  attribute?: string;
  value?: unknown;
  data?: { field?: string };
}

export type ConditionGroup = Condition[];

export interface FieldLogicDef {
  visible?: { conditionGroup?: ConditionGroup };
  required?: { conditionGroup?: ConditionGroup };
  readOnly?: { conditionGroup?: ConditionGroup };
}

export type EntityLogicDefs = Record<string, FieldLogicDef>;

export interface FieldLogicState {
  visible: boolean;
  required: boolean;
  readOnly: boolean;
}

/** Unbekannte Operatoren nur einmal melden, sonst flutet es die Konsole. */
const warned = new Set<string>();

const isEmptyValue = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

/** null, undefined und '' gelten als derselbe „leere" Wert. */
function looseEquals(left: unknown, right: unknown): boolean {
  if (isEmptyValue(left) && isEmptyValue(right)) return true;
  if (left === right) return true;
  if (typeof left === 'number' || typeof right === 'number') {
    return Number(left) === Number(right);
  }
  return false;
}

function compare(left: unknown, right: unknown): number | null {
  if (isEmptyValue(left) || isEmptyValue(right)) return null;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }
  const leftText = String(left);
  const rightText = String(right);
  return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
}

function asList(value: unknown): Condition[] {
  if (Array.isArray(value)) return value as Condition[];
  if (value && typeof value === 'object') return [value as Condition];
  return [];
}

export function evaluateCondition(condition: Condition, record: RecordData): boolean {
  const { type } = condition;

  // Verknüpfungen
  if (type === 'and') return asList(condition.value).every((c) => evaluateCondition(c, record));
  if (type === 'or') return asList(condition.value).some((c) => evaluateCondition(c, record));
  if (type === 'not') return !asList(condition.value).every((c) => evaluateCondition(c, record));

  const actual = condition.attribute ? record[condition.attribute] : undefined;
  const expected = condition.value;

  switch (type) {
    case 'isEmpty':
      return isEmptyValue(actual);
    case 'isNotEmpty':
      return !isEmptyValue(actual);
    case 'isTrue':
      return Boolean(actual);
    case 'isFalse':
      return !actual;
    case 'equals':
      return looseEquals(actual, expected);
    case 'notEquals':
      return !looseEquals(actual, expected);
    case 'greaterThan':
      return (compare(actual, expected) ?? -1) > 0;
    case 'lessThan':
      return (compare(actual, expected) ?? 1) < 0;
    case 'greaterThanOrEquals':
      return (compare(actual, expected) ?? -1) >= 0;
    case 'lessThanOrEquals':
      return (compare(actual, expected) ?? 1) <= 0;
    case 'in':
      return Array.isArray(expected) && expected.some((v) => looseEquals(actual, v));
    case 'notIn':
      return !(Array.isArray(expected) && expected.some((v) => looseEquals(actual, v)));
    case 'contains':
      // Arrays (linkMultiple, checklist) wie auch Texte
      if (Array.isArray(actual)) return actual.some((v) => looseEquals(v, expected));
      return typeof actual === 'string' && typeof expected === 'string'
        ? actual.includes(expected)
        : false;
    case 'has':
      return Array.isArray(actual) && actual.some((v) => looseEquals(v, expected));
    default:
      // Laut PLAN.md: unbekannte Operatoren wohlwollend als `true` werten und
      // melden — ein Feld zu zeigen ist harmloser, als es fälschlich zu
      // verstecken.
      if (!warned.has(type)) {
        warned.add(type);
        console.warn(`[dynamicLogic] Unbekannter Operator "${type}" — als true gewertet.`, condition);
      }
      return true;
  }
}

/** Ein `conditionGroup`-Array ist UND-verknüpft; leer/fehlend heißt „trifft zu". */
export function evaluateConditionGroup(
  group: ConditionGroup | undefined,
  record: RecordData,
): boolean {
  if (!group || !group.length) return true;
  return group.every((condition) => evaluateCondition(condition, record));
}

/**
 * Wertet die Logik aller Felder gegen den aktuellen Formularstand aus.
 * Ohne Bedingung gilt: sichtbar, nicht dynamisch pflichtig, nicht gesperrt.
 */
export function resolveFieldLogic(
  defs: EntityLogicDefs | undefined,
  record: RecordData,
): Record<string, FieldLogicState> {
  const result: Record<string, FieldLogicState> = {};
  for (const [field, spec] of Object.entries(defs ?? {})) {
    result[field] = {
      visible: spec.visible ? evaluateConditionGroup(spec.visible.conditionGroup, record) : true,
      required: spec.required ? evaluateConditionGroup(spec.required.conditionGroup, record) : false,
      readOnly: spec.readOnly ? evaluateConditionGroup(spec.readOnly.conditionGroup, record) : false,
    };
  }
  return result;
}

/** Nur für Tests: gemeldete Operatoren zurücksetzen. */
export function resetWarnings() {
  warned.clear();
}
