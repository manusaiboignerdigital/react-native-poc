import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  evaluateCondition,
  evaluateConditionGroup,
  resolveFieldLogic,
  resetWarnings,
  type ConditionGroup,
  type EntityLogicDefs,
} from './dynamicLogic';
import logicFixture from '../../fixtures/dynamic-logic-examples.json';

/**
 * Die Bedingungen stammen aus der echten Instanz (fixtures/, Phase 0), damit
 * die Tests die tatsächlich vorkommenden Formen abdecken und nicht nur
 * ausgedachte.
 */
const logicDefs = (logicFixture as Record<string, unknown>).__logicDefs as Record<
  string,
  { fields: EntityLogicDefs }
>;
const pruefberichte = logicDefs.CPruefberichte.fields;

beforeEach(() => resetWarnings());

describe('Operatoren', () => {
  const record = {
    text: 'abc',
    leer: '',
    nichts: null,
    zahl: 5,
    wahr: true,
    falsch: false,
    liste: ['Schlauch', 'Sonstiges'],
    leereListe: [] as string[],
  };
  const evaluate = (type: string, attribute: string, value?: unknown) =>
    evaluateCondition({ type, attribute, value }, record);

  it('isEmpty / isNotEmpty behandeln null, "" und [] als leer', () => {
    expect(evaluate('isEmpty', 'leer')).toBe(true);
    expect(evaluate('isEmpty', 'nichts')).toBe(true);
    expect(evaluate('isEmpty', 'leereListe')).toBe(true);
    expect(evaluate('isEmpty', 'fehlt')).toBe(true);
    expect(evaluate('isEmpty', 'text')).toBe(false);
    expect(evaluate('isNotEmpty', 'text')).toBe(true);
    expect(evaluate('isNotEmpty', 'leer')).toBe(false);
  });

  it('isTrue / isFalse', () => {
    expect(evaluate('isTrue', 'wahr')).toBe(true);
    expect(evaluate('isTrue', 'falsch')).toBe(false);
    expect(evaluate('isFalse', 'falsch')).toBe(true);
    expect(evaluate('isFalse', 'fehlt')).toBe(true);
  });

  it('equals / notEquals, inklusive null gegen fehlendes Attribut', () => {
    expect(evaluate('equals', 'text', 'abc')).toBe(true);
    expect(evaluate('equals', 'text', 'xyz')).toBe(false);
    expect(evaluate('equals', 'zahl', '5')).toBe(true); // Zahl gegen Zahltext
    expect(evaluate('equals', 'fehlt', null)).toBe(true);
    expect(evaluate('notEquals', 'text', 'xyz')).toBe(true);
  });

  it('Größenvergleiche', () => {
    expect(evaluate('greaterThan', 'zahl', 3)).toBe(true);
    expect(evaluate('greaterThan', 'zahl', 5)).toBe(false);
    expect(evaluate('greaterThanOrEquals', 'zahl', 5)).toBe(true);
    expect(evaluate('lessThan', 'zahl', 9)).toBe(true);
    expect(evaluate('lessThanOrEquals', 'zahl', 5)).toBe(true);
    // Leere Werte liefern kein sinnvolles Ergebnis -> false statt Zufall
    expect(evaluate('greaterThan', 'nichts', 1)).toBe(false);
  });

  it('in / notIn', () => {
    expect(evaluate('in', 'text', ['abc', 'def'])).toBe(true);
    expect(evaluate('in', 'text', ['def'])).toBe(false);
    expect(evaluate('notIn', 'text', ['def'])).toBe(true);
  });

  it('has arbeitet auf Array-Werten (checklist, linkMultiple)', () => {
    expect(evaluate('has', 'liste', 'Sonstiges')).toBe(true);
    expect(evaluate('has', 'liste', 'Pumpe')).toBe(false);
    expect(evaluate('has', 'text', 'abc')).toBe(false); // kein Array
  });

  it('contains deckt Arrays und Texte ab', () => {
    expect(evaluate('contains', 'liste', 'Schlauch')).toBe(true);
    expect(evaluate('contains', 'text', 'b')).toBe(true);
    expect(evaluate('contains', 'text', 'z')).toBe(false);
  });

  it('unbekannte Operatoren gelten als true und werden einmal gemeldet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(evaluate('vollkommenNeu', 'text', 1)).toBe(true);
    expect(evaluate('vollkommenNeu', 'text', 2)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('Verknüpfungen', () => {
  const record = { a: 'x', b: '' };

  it('and, or, not', () => {
    const a = { type: 'equals', attribute: 'a', value: 'x' };
    const b = { type: 'isNotEmpty', attribute: 'b' };
    expect(evaluateCondition({ type: 'and', value: [a, b] }, record)).toBe(false);
    expect(evaluateCondition({ type: 'or', value: [a, b] }, record)).toBe(true);
    expect(evaluateCondition({ type: 'not', value: [b] }, record)).toBe(true);
  });

  it('conditionGroup ist UND-verknüpft, leer heißt "trifft zu"', () => {
    const group: ConditionGroup = [
      { type: 'equals', attribute: 'a', value: 'x' },
      { type: 'isEmpty', attribute: 'b' },
    ];
    expect(evaluateConditionGroup(group, record)).toBe(true);
    expect(evaluateConditionGroup([...group, { type: 'isNotEmpty', attribute: 'b' }], record)).toBe(
      false,
    );
    expect(evaluateConditionGroup([], record)).toBe(true);
    expect(evaluateConditionGroup(undefined, record)).toBe(true);
  });
});

describe('Echte Bedingungen der Instanz', () => {
  it('sonstiges wird sichtbar, sobald die Checkliste "Sonstiges" enthält', () => {
    const group = pruefberichte.sonstiges.visible?.conditionGroup;
    expect(group).toBeTruthy();
    expect(evaluateConditionGroup(group, { ersatzteileDosiergeraete: [] })).toBe(false);
    expect(evaluateConditionGroup(group, { ersatzteileDosiergeraete: ['Pumpe'] })).toBe(false);
    expect(evaluateConditionGroup(group, { ersatzteileDosiergeraete: ['Pumpe', 'Sonstiges'] })).toBe(
      true,
    );
  });

  it('ein signierter Bericht sperrt sonstiges', () => {
    const group = pruefberichte.sonstiges.readOnly?.conditionGroup;
    expect(evaluateConditionGroup(group, { status: 'unsigned' })).toBe(false);
    expect(evaluateConditionGroup(group, { status: 'signed' })).toBe(true);
  });

  it('Ersatzteil-Listen erscheinen nur bei ersatzteile = "ja"', () => {
    const group = pruefberichte.ersatzteileDosiergeraete.visible?.conditionGroup;
    expect(evaluateConditionGroup(group, { ersatzteile: 'nein' })).toBe(false);
    expect(evaluateConditionGroup(group, { ersatzteile: 'ja' })).toBe(true);
  });

  it('cLieferschein bleibt gesperrt, solange keine Kundenbaustelle gewählt ist', () => {
    // Diese Bedingung trägt zusätzlich `data.field` — für die Auswertung zählt
    // allein `attribute` (cKundenbaustelleId).
    const group = pruefberichte.cLieferschein.readOnly?.conditionGroup;
    expect(evaluateConditionGroup(group, {})).toBe(true);
    expect(evaluateConditionGroup(group, { cKundenbaustelleId: null })).toBe(true);
    expect(evaluateConditionGroup(group, { cKundenbaustelleId: 'abc' })).toBe(false);
  });

  it('alle Operatoren der Instanz sind implementiert (kein Fallback nötig)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const spec of Object.values(pruefberichte)) {
      for (const kind of ['visible', 'required', 'readOnly'] as const) {
        evaluateConditionGroup(spec[kind]?.conditionGroup, {});
      }
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('resolveFieldLogic', () => {
  it('liefert für jedes Feld sichtbar/pflichtig/gesperrt', () => {
    const state = resolveFieldLogic(pruefberichte, {
      status: 'signed',
      ersatzteile: 'ja',
      ersatzteileDosiergeraete: ['Sonstiges'],
    });

    expect(state.sonstiges).toEqual({ visible: true, required: false, readOnly: true });
    expect(state.ersatzteileDosiergeraete.visible).toBe(true);
    expect(state.ersatzteileDosiergeraete.readOnly).toBe(true);
  });

  it('ohne Bedingung gilt sichtbar und nicht gesperrt', () => {
    const state = resolveFieldLogic({ feld: {} }, {});
    expect(state.feld).toEqual({ visible: true, required: false, readOnly: false });
  });
});
