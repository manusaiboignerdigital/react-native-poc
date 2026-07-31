import { describe, expect, it } from 'vitest';
import { buildSelect, shiftBackMinutes } from './pull';
import { Meta } from '../engine/meta';
import type { BootData } from '../boot';
import metadata from '../../fixtures/metadata.json';
import i18n from '../../fixtures/i18n.json';
import detailLayout from '../../fixtures/layout-CPruefberichte-detail.json';
import listLayout from '../../fixtures/layout-CPruefberichte-list.json';

/** Meta aus den echten Fixtures, optional mit abweichenden Layouts. */
function makeMeta(layouts?: Record<string, unknown>) {
  return new Meta({
    appUser: { user: { id: 'u', userName: 'test' } },
    metadata,
    i18n,
    layouts: layouts ?? {
      'layout:CPruefberichte:detail': detailLayout,
      'layout:CPruefberichte:list': listLayout,
    },
    scopeEntities: ['CPruefberichte'],
    source: 'cache',
    loadedAt: null,
  } as unknown as BootData);
}

describe('buildSelect', () => {
  const select = buildSelect(makeMeta(), 'CPruefberichte');

  it('fordert immer die Basisattribute an', () => {
    expect(select).toEqual(expect.arrayContaining(['id', 'name', 'modifiedAt', 'createdAt']));
  });

  it('nimmt die Felder aus detail- und list-Layout auf', () => {
    // aus dem detail-Layout
    expect(select).toContain('dosierung');
    expect(select).toContain('ersatzteileDosiergeraete');
    // nur im list-Layout
    expect(select).toContain('status');
  });

  it('löst belongsTo-Links in Id und Name auf', () => {
    expect(select).toContain('cLieferscheinId');
    expect(select).toContain('cLieferscheinName');
    // Das Feld selbst gehört nicht in select — es existiert als Attribut nicht.
    expect(select).not.toContain('cLieferschein');
  });

  it('löst linkMultiple in Ids und Names auf', () => {
    // `teams` steht in keinem Layout dieser Instanz — deshalb hier ein
    // Layout, das den Zweig gezielt trifft.
    const withTeams = buildSelect(
      makeMeta({
        'layout:CPruefberichte:detail': [{ rows: [[{ name: 'teams' }, false]] }],
        'layout:CPruefberichte:list': [{ name: 'name' }],
      }),
      'CPruefberichte',
    );
    expect(withTeams).toContain('teamsIds');
    expect(withTeams).toContain('teamsNames');
    expect(withTeams).not.toContain('teams');
  });

  it('überspringt Felder, die es in entityDefs nicht gibt', () => {
    const select = buildSelect(
      makeMeta({
        'layout:CPruefberichte:detail': [{ rows: [[{ name: 'gibtEsNicht' }]] }],
        'layout:CPruefberichte:list': [{ name: 'name' }],
      }),
      'CPruefberichte',
    );
    expect(select).not.toContain('gibtEsNicht');
  });

  it('enthält keine Dubletten', () => {
    expect(new Set(select).size).toBe(select.length);
  });
});

describe('shiftBackMinutes', () => {
  it('rechnet im Espo-Format und in UTC zurück', () => {
    expect(shiftBackMinutes('2026-07-26 21:12:55', 2)).toBe('2026-07-26 21:10:55');
  });

  it('trägt Stunden- und Tagesgrenzen korrekt', () => {
    expect(shiftBackMinutes('2026-07-27 00:01:00', 2)).toBe('2026-07-26 23:59:00');
  });
});
