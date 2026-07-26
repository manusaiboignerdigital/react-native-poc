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
src/api/espoClient.ts   fetch-Wrapper, Auth, Fehlerklassen, X-Version-Number
src/db/schema.ts        Dexie-Stores (meta, records, outbox, idMap, syncState)
src/db/repo.ts          Zugriffsschicht (einziger Ort mit Dexie-Kontakt)
src/boot.ts             Boot-Sequenz online/offline
src/store.ts            App-Zustand (Zustand)
src/pages/              Setup- und Startbildschirm
public/sw.js            Minimaler Service Worker für die App-Shell
```

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

**Stand: Phase 0 abgeschlossen, Phase 1 umgesetzt.** Alle Annahmen A3–A11 sind gegen
`http://emayr.local` verifiziert, die Fixtures liegen im Repo, die Befunde
stehen in [`docs/API-NOTES.md`](docs/API-NOTES.md). Wesentliche Abweichungen
von PLAN.md:

- Es gibt keine Eingangsrechnungs-Entität — Scope ist **`CPruefberichte` + `CEmayrQrs`**.
- Dynamic Logic liegt in **`logicDefs`**, nicht in `clientDefs.dynamicLogic`.
- Die Version reist beim Schreiben im Header **`X-Version-Number`**, nicht im Payload.
- `checklist`, `image` und `barcode` brauchen Registry-Einträge bzw. den Fallback-Renderer; `currency` entfällt.
- CORS ist wie erwartet blockiert → Vite-Proxy in der Entwicklung.
