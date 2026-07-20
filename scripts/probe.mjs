#!/usr/bin/env node
/**
 * Phase-0-Probe gegen eine echte EspoCRM-Instanz (siehe PLAN.md, Phase 0).
 *
 * Verifiziert die Annahmen A3–A11 und schreibt geschwärzte API-Antworten
 * nach fixtures/. Dependency-frei, benötigt Node >= 18 (natives fetch).
 *
 * Nutzung:
 *   cp .env.example .env   # ausfüllen (URL + API-Key oder User/Token)
 *   node scripts/probe.mjs
 *
 * Der Schreibtest (A9, Optimistic Concurrency) läuft nur, wenn
 * ESPOCRM_TEST_ENTITY + ESPOCRM_TEST_RECORD_ID gesetzt sind, und schreibt
 * den bestehenden Feldwert unverändert zurück (non-destructive).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'fixtures');

// ---------------------------------------------------------------- .env laden
function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}
loadEnv();

const BASE = (process.env.VITE_ESPOCRM_URL || '').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;

if (!BASE) {
  console.error('FEHLER: VITE_ESPOCRM_URL fehlt. .env aus .env.example anlegen und ausfüllen.');
  process.exit(1);
}

function authHeaders() {
  if (process.env.ESPOCRM_API_KEY) {
    return { 'X-Api-Key': process.env.ESPOCRM_API_KEY };
  }
  if (process.env.ESPOCRM_USER && process.env.ESPOCRM_TOKEN) {
    const b64 = Buffer.from(`${process.env.ESPOCRM_USER}:${process.env.ESPOCRM_TOKEN}`).toString('base64');
    return { 'Espo-Authorization': `Basic ${b64}` };
  }
  console.error('FEHLER: Weder ESPOCRM_API_KEY noch ESPOCRM_USER/ESPOCRM_TOKEN gesetzt.');
  process.exit(1);
}

// ------------------------------------------------------------------- Helpers
const report = [];
function log(line) {
  console.log(line);
  report.push(line);
}

async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const url = path.startsWith('http') ? path : `${API}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* kein JSON */ }
  if (raw) return { res, json, text };
  if (!res.ok) {
    const reason = res.headers.get('X-Status-Reason') || '';
    throw new Error(`${method} ${path} -> HTTP ${res.status} ${reason} ${text.slice(0, 300)}`);
  }
  return json;
}

/**
 * Schwärzt sensible Werte rekursiv. Struktur bleibt erhalten, damit die
 * Fixtures für die Rendering-Engine (Phase 2) nutzbar sind.
 */
const SENSITIVE_KEY = /token|password|secret|apiKey|authKey|secretKey|smtp|salt/i;
const PII_KEY = /^(emailAddress|phoneNumber|phone|mobile|sipUri)/i;
function redact(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => redact(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redact(v, k);
    return out;
  }
  if (typeof value === 'string' && value !== '') {
    if (SENSITIVE_KEY.test(key)) return '***REDACTED***';
    if (PII_KEY.test(key)) return '***PII***';
  }
  return value;
}

function saveFixture(name, data) {
  mkdirSync(FIXTURES, { recursive: true });
  const file = join(FIXTURES, name);
  writeFileSync(file, JSON.stringify(redact(data), null, 2) + '\n');
  log(`  -> fixtures/${name} geschrieben`);
}

// ------------------------------------------------------------------- Probes
async function probeAppUser() {
  log('\n== A3: GET App/user ==');
  const data = await api('App/user');
  saveFixture('app-user.json', data);
  log(`  Top-Level-Keys: ${Object.keys(data).join(', ')}`);
  if (data.user) log(`  user.userName vorhanden: ${'userName' in data.user}`);
  if (data.acl) log(`  acl-Keys: ${Object.keys(data.acl).join(', ')}`);
  return data;
}

async function probeMetadata() {
  log('\n== A1/A8/A11: GET Metadata ==');
  const data = await api('Metadata');
  saveFixture('metadata.json', data);
  log(`  Top-Level-Keys: ${Object.keys(data).join(', ')}`);

  const entityDefs = data.entityDefs || {};
  const custom = Object.keys(entityDefs).filter((e) => /^C[A-Z]/.test(e));
  log(`  Entitäten gesamt: ${Object.keys(entityDefs).length}`);
  log(`  Custom-Entitäten (C-Präfix, Kandidaten für A11): ${custom.join(', ') || '(keine)'}`);

  // A8: dynamicLogic-Beispiele suchen
  const dl = [];
  for (const [entity, defs] of Object.entries(data.clientDefs || {})) {
    if (defs && defs.dynamicLogic) dl.push(entity);
  }
  log(`  Entitäten mit clientDefs.dynamicLogic (A8): ${dl.join(', ') || '(keine)'}`);
  if (dl.length) saveFixture('dynamic-logic-examples.json',
    Object.fromEntries(dl.map((e) => [e, data.clientDefs[e].dynamicLogic])));

  // Feldtypen-Inventar der Probe-Entitäten
  for (const entity of probeEntities()) {
    const fields = entityDefs[entity]?.fields;
    if (!fields) { log(`  WARNUNG: entityDefs.${entity} nicht gefunden`); continue; }
    const types = {};
    for (const def of Object.values(fields)) types[def.type] = (types[def.type] || 0) + 1;
    log(`  Feldtypen ${entity}: ${Object.entries(types).map(([t, n]) => `${t}(${n})`).join(', ')}`);
  }
  return data;
}

async function probeI18n() {
  log('\n== A2: GET I18n ==');
  const data = await api('I18n');
  saveFixture('i18n.json', data);
  log(`  Top-Level-Keys (Scopes): ${Object.keys(data).slice(0, 15).join(', ')} ...`);
  // Übersetzungspfad für Enum-Optionen prüfen (vermutet: {Entity}.options.{field})
  for (const entity of probeEntities()) {
    const options = data[entity]?.options;
    if (options) log(`  ${entity}.options-Felder: ${Object.keys(options).join(', ')}`);
    else log(`  ${entity}.options: nicht vorhanden`);
  }
  return data;
}

function probeEntities() {
  return (process.env.ESPOCRM_PROBE_ENTITIES || 'Contact,Account').split(',').map((s) => s.trim()).filter(Boolean);
}

async function probeLayouts() {
  log('\n== A4: Layout-Pfad ermitteln ==');
  const candidates = [
    (entity, name) => `${entity}/layout/${name}`,
    (entity, name) => `Layout/${entity}/${name}`,
  ];
  let workingPattern = null;
  for (const entity of probeEntities()) {
    for (const name of ['detail', 'list']) {
      let ok = false;
      for (const make of candidates) {
        const path = make(entity, name);
        const { res, json } = await api(path, { raw: true });
        if (res.ok && json) {
          log(`  OK: GET api/v1/${path} (HTTP ${res.status})`);
          saveFixture(`layout-${entity}-${name}.json`, json);
          workingPattern = workingPattern || path.replace(entity, '{Entity}').replace(name, '{name}');
          ok = true;
          break;
        }
        log(`  Fehlschlag: GET api/v1/${path} -> HTTP ${res.status}`);
      }
      if (!ok) log(`  WARNUNG: Kein Layout-Pfad für ${entity}/${name} gefunden — Netzwerk-Tab des Web-Clients prüfen!`);
    }
  }
  if (workingPattern) log(`  ERGEBNIS A4: Layout-Pfad = api/v1/${workingPattern}`);
  return workingPattern;
}

async function probeList() {
  log('\n== A5/A6/A7: Listen, Pagination, where auf modifiedAt ==');
  const entity = probeEntities()[0];

  // A5: Pagination + orderBy + select
  const params = new URLSearchParams({
    maxSize: '5', offset: '0', orderBy: 'modifiedAt', order: 'desc',
    select: 'id,name,modifiedAt,assignedUserId,assignedUserName,teamsIds,teamsNames',
  });
  const list = await api(`${entity}?${params}`);
  log(`  GET ${entity} maxSize=5: total=${list.total}, geliefert=${list.list?.length}`);
  saveFixture(`list-${entity}.json`, list);

  // A7: belongsTo-/linkMultiple-Attribute im Datensatz?
  const rec = list.list?.[0];
  if (rec) {
    log(`  A7: assignedUserId=${'assignedUserId' in rec} assignedUserName=${'assignedUserName' in rec} ` +
        `teamsIds=${'teamsIds' in rec} teamsNames=${'teamsNames' in rec}`);
  }

  // A5: maxSize-Obergrenze testen
  const { res: bigRes, json: bigJson } = await api(`${entity}?maxSize=500`, { raw: true });
  if (bigRes.ok) log(`  maxSize=500 akzeptiert, geliefert=${bigJson.list?.length} (Obergrenze beachten)`);
  else log(`  maxSize=500 -> HTTP ${bigRes.status} ${bigRes.headers.get('X-Status-Reason') || ''} (Obergrenze niedriger)`);

  // A6: where-Filter auf modifiedAt (Format lt. Doku "Search parameters")
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const whereParams = new URLSearchParams({ maxSize: '5' });
  whereParams.set('where[0][type]', 'after');
  whereParams.set('where[0][attribute]', 'modifiedAt');
  whereParams.set('where[0][value]', since);
  const { res: wRes, json: wJson } = await api(`${entity}?${whereParams}`, { raw: true });
  if (wRes.ok) {
    log(`  A6 OK: where[type=after][attribute=modifiedAt][value=${since}] -> total=${wJson.total}`);
    saveFixture(`list-${entity}-delta.json`, wJson);
  } else {
    log(`  A6 FEHLSCHLAG: HTTP ${wRes.status} — where-Format prüfen (Doku "Search parameters")`);
  }
}

async function probeVersionNumber() {
  log('\n== A9: Optimistic Concurrency (versionNumber) ==');
  const entity = process.env.ESPOCRM_TEST_ENTITY;
  const id = process.env.ESPOCRM_TEST_RECORD_ID;
  if (!entity || !id) {
    log('  ÜBERSPRUNGEN: ESPOCRM_TEST_ENTITY/ESPOCRM_TEST_RECORD_ID nicht gesetzt.');
    return;
  }
  const rec = await api(`${entity}/${id}`);
  saveFixture(`record-${entity}.json`, rec);
  log(`  versionNumber im Datensatz vorhanden: ${'versionNumber' in rec} (Wert: ${rec.versionNumber})`);

  // Non-destructive: name unverändert zurückschreiben, mit aktueller Version
  const { res: okRes } = await api(`${entity}/${id}`, {
    method: 'PUT', raw: true,
    body: { name: rec.name, versionNumber: rec.versionNumber },
  });
  log(`  PUT mit aktueller versionNumber -> HTTP ${okRes.status}`);

  // Veraltete Version senden -> 409 erwartet
  if (typeof rec.versionNumber === 'number') {
    const { res: staleRes } = await api(`${entity}/${id}`, {
      method: 'PUT', raw: true,
      body: { name: rec.name, versionNumber: rec.versionNumber - 1 },
    });
    log(`  PUT mit veralteter versionNumber -> HTTP ${staleRes.status} (409 erwartet, sofern Feature aktiv)`);
  }
}

async function probeCors() {
  log('\n== A10: CORS von http://localhost:5173 ==');
  // Preflight simulieren, wie ihn der Browser für authentifizierte Requests schickt
  const res = await fetch(`${API}/App/user`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'x-api-key, espo-authorization',
    },
  });
  const allowOrigin = res.headers.get('Access-Control-Allow-Origin');
  log(`  OPTIONS Preflight -> HTTP ${res.status}, Access-Control-Allow-Origin: ${allowOrigin ?? '(fehlt)'}`);
  if (!allowOrigin) {
    log('  ERGEBNIS A10: CORS blockiert. Dev: Vite-Proxy (/api -> Instanz). Prod: gleiche Domain/Reverse-Proxy.');
  } else {
    log(`  ERGEBNIS A10: CORS erlaubt für: ${allowOrigin}`);
  }
}

// --------------------------------------------------------------------- Main
(async () => {
  log(`Probe gegen ${API} — ${new Date().toISOString()}`);
  const failures = [];
  for (const [name, fn] of [
    ['App/user', probeAppUser],
    ['Metadata', probeMetadata],
    ['I18n', probeI18n],
    ['Layouts', probeLayouts],
    ['Listen/where', probeList],
    ['versionNumber', probeVersionNumber],
    ['CORS', probeCors],
  ]) {
    try {
      await fn();
    } catch (err) {
      failures.push(name);
      log(`  FEHLER in ${name}: ${err.message}`);
    }
  }
  log('\n== Zusammenfassung ==');
  log(failures.length ? `Fehlgeschlagen: ${failures.join(', ')}` : 'Alle Probes durchgelaufen.');
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(join(FIXTURES, 'probe-report.txt'), report.join('\n') + '\n');
  console.log('\nReport: fixtures/probe-report.txt — Ergebnisse in docs/API-NOTES.md übertragen.');
  process.exit(failures.length ? 1 : 0);
})();
