# fixtures/

Echte API-Antworten der EspoCRM-Zielinstanz, erzeugt durch `node scripts/probe.mjs`
(Phase 0, siehe PLAN.md). Sensible Werte (Tokens, Passwörter, E-Mail-Adressen,
Telefonnummern) werden vom Skript automatisch geschwärzt (`***REDACTED***` / `***PII***`).

Erwartete Dateien nach einem erfolgreichen Lauf:

| Datei | Quelle |
|---|---|
| `app-user.json` | `GET api/v1/App/user` (A3) |
| `metadata.json` | `GET api/v1/Metadata` (A1/A8/A11) |
| `i18n.json` | `GET api/v1/I18n` (A2) |
| `layout-{Entity}-{detail\|list}.json` | Layout-Endpunkt (A4) |
| `list-{Entity}.json` | Listen-Request mit Pagination/`select` (A5/A7) |
| `list-{Entity}-delta.json` | `where`-Filter auf `modifiedAt` (A6) |
| `dynamic-logic-examples.json` | aus Metadata extrahiert (A8) |
| `record-{Entity}.json` | Einzeldatensatz des Schreibtests (A9, opt-in) |
| `probe-report.txt` | Konsolen-Protokoll des Laufs |

Vor dem Commit stichprobenartig prüfen, dass keine sensiblen Werte
durchgerutscht sind. Ungeschwärzte Rohdaten gehören nach `fixtures/raw/`
(gitignored).
