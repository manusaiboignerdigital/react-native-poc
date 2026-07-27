# Espo Offline PWA — Prototyp

Metadata-getriebene Rendering-Engine + Offline-Cache + Outbox-Sync für EspoCRM 10.x.
Vollständiger Plan: [PLAN.md](PLAN.md).

## App starten (Phase 1)

```bash
cp .env.example .env    # VITE_ESPOCRM_URL eintragen
npm install
npm run dev             # http://localhost:5173
```

Im Browser Zugangsdaten eingeben (API-Key oder Nutzer + Passwort) — die App lädt
Metadata, I18n, App/user und die Layouts der Scope-Entitäten nach IndexedDB.

Der Offline-Kaltstart braucht den Service Worker und damit den Build:

```bash
npm run build && npm run preview   # http://localhost:4173
```

Dort einmal online laden, dann in den DevTools auf *Offline* schalten und neu
laden — die App startet vollständig aus dem lokalen Cache.

| Skript | Zweck |
|---|---|
| `npm run dev` | Dev-Server mit Proxy `/api` → Instanz |
| `npm run build` | Typecheck + Produktions-Build |
| `npm run preview` | Build lokal servieren (inkl. Proxy) |
| `npm run typecheck` | nur TypeScript |
| `npm run probe` | Phase-0-Probe gegen die Instanz |

### Architektur

```
src/api/espoClient.ts       fetch-Wrapper, Auth, Fehlerklassen, X-Version-Number
src/db/schema.ts            Dexie-Stores (meta, records, outbox, idMap, syncState)
src/db/repo.ts              Zugriffsschicht (einziger Ort mit Dexie-Kontakt)
src/boot.ts                 Boot-Sequenz online/offline
src/store.ts                App-Zustand und Routing
src/engine/meta.ts          Metadaten, Layouts, Labels, Optionen
src/engine/fieldRegistry.tsx  fieldType -> Detail/Edit/validate + Fallback
src/engine/DetailView.tsx   rendert aus dem detail-Layout
src/engine/EditView.tsx     Formular aus demselben Layout, mit Validierung
src/engine/ListView.tsx     Tabelle aus dem list-Layout
src/sync/pull.ts            Replikation (Phase 2: erste Seite, Ausbau in Phase 4)
src/pages/                  Setup, Übersicht, Liste, Detail/Bearbeiten
public/sw.js                Minimaler Service Worker für die App-Shell
```

### Rendering-Engine (Phase 2)

Kein View kennt einen Feldnamen — Felder, Reihenfolge und Spalten stammen
ausschließlich aus den gecachten Layouts, Typen und Pflichtangaben aus
`entityDefs`, Beschriftungen aus der I18n.

Abgedeckte Feldtypen: `varchar, text, barcode, enum, multiEnum, checklist,
array, bool, int, float, currency, date, datetime, email, phone, url, link,
linkMultiple`. Alles andere — auf dieser Instanz `image` — landet im
**Fallback-Renderer**, der Rohwert und Typ anzeigt, statt die Ansicht zu
zerlegen. Fehlt ein Layout ganz, wird es aus `entityDefs` abgeleitet.

`link`-Felder werden im Edit-Modus **aus dem lokalen Bestand** ausgewählt,
damit die Auswahl offline genauso funktioniert wie online. `linkMultiple`
bleibt lesend (Nicht-Ziel laut PLAN.md).

## Phase 0 — Annahmen verifizieren

Kein Anwendungscode; nur Probe-Skript + Dokumentation.

```bash
cp .env.example .env    # Instanz-URL + API-Key oder User/Token eintragen
node scripts/probe.mjs  # benötigt Node >= 18
```

Das Skript testet die Annahmen A3–A11 aus PLAN.md, schreibt geschwärzte
API-Antworten nach [`fixtures/`](fixtures/README.md) und ein Protokoll nach
`fixtures/probe-report.txt`. Die Befunde anschließend in
[`docs/API-NOTES.md`](docs/API-NOTES.md) eintragen.

Der Schreibtest für Optimistic Concurrency (A9) läuft nur, wenn in `.env`
`ESPOCRM_TEST_ENTITY` und `ESPOCRM_TEST_RECORD_ID` auf einen **Testdatensatz**
zeigen (non-destructive: schreibt bestehende Werte unverändert zurück).

`.env` ist gitignored — Zugangsdaten niemals committen.

**Stand: Phasen 0–2 umgesetzt.** Alle Annahmen A3–A11 sind gegen
`http://emayr.local` verifiziert, die Fixtures liegen im Repo, die Befunde
stehen in [`docs/API-NOTES.md`](docs/API-NOTES.md). Wesentliche Abweichungen
von PLAN.md:

- Es gibt keine Eingangsrechnungs-Entität — Scope ist **`CPruefberichte` + `CEmayrQrs`**.
- Dynamic Logic liegt in **`logicDefs`**, nicht in `clientDefs.dynamicLogic`.
- Die Version reist beim Schreiben im Header **`X-Version-Number`**, nicht im Payload.
- `checklist`, `image` und `barcode` brauchen Registry-Einträge bzw. den Fallback-Renderer; `currency` entfällt.
- CORS ist wie erwartet blockiert → Vite-Proxy in der Entwicklung.
