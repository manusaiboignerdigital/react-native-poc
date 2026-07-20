# API-NOTES — verifizierte Pfade, Formate, Limits (Phase 0)

> Status-Legende: ✅ verifiziert an der Instanz · 📚 per offizieller Doku belegt ·
> ⏳ **AUSSTEHEND** — wartet auf Lauf von `scripts/probe.mjs` gegen die echte Instanz.
>
> **Stand:** Es liegen noch keine Instanz-Zugangsdaten vor (siehe PLAN.md →
> „Offene Entscheidungen"). Sobald `.env` ausgefüllt ist: `node scripts/probe.mjs`
> ausführen, Fixtures prüfen und diese Datei mit den Befunden aktualisieren.
> Erkenntnisse aus echten API-Antworten sind verbindlicher als die Annahmen im Plan.

## Basis

- Base-URL: `{VITE_ESPOCRM_URL}/api/v1/` — ⏳ Instanz-URL offen
- Auth (📚 [Doku: API Authentication](https://docs.espocrm.com/development/api/#authentication)):
  - API-User: Header `X-Api-Key: {key}`
  - Regulärer Nutzer: Header `Espo-Authorization: Basic base64(user:passwordOrToken)`
- Fehlerdetails: Espo liefert den Grund oft im Response-Header `X-Status-Reason` (📚).

## A3 — `GET App/user` (Antwortstruktur)

⏳ AUSSTEHEND → `fixtures/app-user.json`

Zu klären: Top-Level-Keys (erwartet: `user`, `acl`, `preferences`, `settings`, …),
Struktur von `acl` (Scope-Level `read/edit/delete/stream` + Feld-Level), wo die
Sprache des Nutzers steht.

## A4 — Layout-Endpunkt

⏳ AUSSTEHEND → `fixtures/layout-{Entity}-{detail|list}.json`

`scripts/probe.mjs` testet beide Kandidaten in dieser Reihenfolge:

1. `GET api/v1/{Entity}/layout/{name}` (vermuteter Pfad des Web-Clients)
2. `GET api/v1/Layout/{Entity}/{name}`

Ergebnis (funktionierender Pfad): `__________`

Erwartetes Format `detail`: `[ { rows: [ [ {name}, {name}|false ], … ] } ]` (Panels → Zeilen → Zellen);
`list`: `[ { name, width?, link? }, … ]` — gegen Fixtures prüfen.

## A5 — Listen: Pagination & Parameter

⏳ AUSSTEHEND → `fixtures/list-{Entity}.json`

- Parameter: `maxSize`, `offset`, `orderBy`, `order` (`asc|desc`), `select` (kommasepariert), `where` (📚 [Doku: Search parameters](https://docs.espocrm.com/development/api-search-params/))
- `maxSize`-Obergrenze: `__________` (Probe testet `maxSize=500`; Erwartung: Ablehnung > 200)
- Antwortform: `{ total: number, list: [ … ] }` — ⏳ bestätigen

## A6 — Delta-Sync über `modifiedAt`

⏳ AUSSTEHEND → `fixtures/list-{Entity}-delta.json`

Getestetes `where`-Format (Query-String, URL-encodiert):

```
where[0][type]=after
where[0][attribute]=modifiedAt
where[0][value]=YYYY-MM-DD HH:MM:SS
```

- Funktioniert: ja ☐ / nein ☐
- Datums-/Zeitformat und Zeitzone des Servers (`value` in UTC?): `__________`
- Für den Delta-Pull relevanter Operator: `after` (streng größer?) vs. Overlap-Strategie aus PLAN.md Phase 4.

## A7 — Beziehungsattribute im Datensatz

⏳ AUSSTEHEND → `fixtures/list-{Entity}.json`, `fixtures/record-{Entity}.json`

- belongsTo-Link `assignedUser` → Attribute `assignedUserId` / `assignedUserName` vorhanden: ☐
- linkMultiple `teams` → `teamsIds` / `teamsNames` vorhanden (mit `select` angefordert): ☐

## A8 — Dynamic Logic

⏳ AUSSTEHEND → `fixtures/dynamic-logic-examples.json`

Erwarteter Pfad: `clientDefs.{Entity}.dynamicLogic.fields.{field}.{visible|required|readOnly}.conditionGroup`.
Probe extrahiert alle Entitäten mit `dynamicLogic` aus `fixtures/metadata.json`.
Gefundene Operatoren (für den Evaluator in Phase 3): `__________`

## A9 — Optimistic Concurrency (`versionNumber`)

⏳ AUSSTEHEND (opt-in: `ESPOCRM_TEST_ENTITY` + `ESPOCRM_TEST_RECORD_ID` in `.env`)

- `versionNumber` im Datensatz vorhanden: ☐
- `PUT` mit veralteter `versionNumber` → HTTP 409: ☐
- Muss das Feature pro Entität aktiviert werden (Doku „Optimistic concurrency control")? `__________`

## A10 — CORS-Strategie

⏳ AUSSTEHEND (Probe schickt OPTIONS-Preflight mit `Origin: http://localhost:5173`)

- `Access-Control-Allow-Origin` gesendet: ☐
- **Entscheidung (Vorschlag, zu bestätigen):**
  - Entwicklung: Vite-Dev-Proxy `/api` → Instanz (`server.proxy` in `vite.config.ts`) — umgeht CORS vollständig.
  - Produktion: PWA unter derselben Domain wie Espo bzw. hinter demselben Reverse-Proxy ausliefern.

## A11 — Entitätsname „Eingangsrechnung"

⏳ AUSSTEHEND → aus `fixtures/metadata.json` (`entityDefs`)

- Exakter API-Name: `__________` (Probe listet alle Custom-Entitäten mit `C`-Präfix)
- Feldtypen-Inventar der Scope-Entitäten: siehe `fixtures/probe-report.txt`

## I18n: Übersetzungspfad für Enum-Optionen

⏳ AUSSTEHEND → `fixtures/i18n.json`

Vermutet: `{Entity}.options.{field}.{value}`; Fallback global `Global.options.{field}`.
Befund: `__________`
