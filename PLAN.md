# PLAN.md — Espo Offline PWA (Prototyp)

Metadata-getriebene Rendering-Engine + Offline-Cache + Outbox-Sync für EspoCRM 10.x.

## So nutzt du diesen Plan mit Claude Code

1. Leeres Projektverzeichnis anlegen, diese Datei als `PLAN.md` hineinlegen.
2. Phasen **einzeln** beauftragen, z. B.: *"Lies PLAN.md und setze Phase 0 vollständig um. Halte dich an die Akzeptanzkriterien."*
3. Nach jeder Phase: Akzeptanzkriterien prüfen (lassen), erst dann die nächste Phase starten.
4. Erkenntnisse aus Phase 0 (echte API-Antworten) sind verbindlicher als Annahmen in diesem Plan. Bei Abweichung: `docs/API-NOTES.md` aktualisieren und danach arbeiten.

## Kontext & Ziel

EspoCRM (auch v10) hat **keinen nativen Offline-Modus**. Dieser Prototyp beweist die Machbarkeit einer PWA, die:

1. Metadaten, Layouts, Übersetzungen und ACL aus der Espo-REST-API lädt und cached,
2. daraus Formulare, Detail- und Listenansichten **dynamisch rendert** (keine hartcodierten Felder),
3. Datensätze inkl. Beziehungsattribute lokal repliziert (IndexedDB),
4. Änderungen offline in einer **Outbox** sammelt und bei Reconnect zurück nach EspoCRM synct.

**Nicht-Ziele des Prototyps** (bewusst ausgeklammert): Attachments/Dateien, E-Mails & Stream, many-to-many-Relationen ohne Feld-Repräsentation, Löschungs-Sync, Workflows/BPM, Mehrbenutzer-Konfliktmerging auf Feldebene.

## Annahmen und ihr Status

Legende: `[VERIFIZIERT]` = per offizieller Doku/Forum belegt · `[TRAINING]` = plausibles Modellwissen, in Phase 0 prüfen · `[OFFEN]` = unbekannt, in Phase 0 klären.

| # | Annahme | Status |
|---|---------|--------|
| A1 | `GET api/v1/Metadata` liefert alle für den authentifizierten Nutzer verfügbaren Metadaten (entityDefs, clientDefs, …) | [VERIFIZIERT] |
| A2 | `GET api/v1/I18n` liefert alle Labels; bei regulärem Nutzer in dessen Sprache, bei API-User in der Systemsprache | [VERIFIZIERT] |
| A3 | `GET api/v1/App/user` liefert Nutzer, Einstellungen und ACL-Daten | [VERIFIZIERT existiert; Antwortstruktur OFFEN] |
| A4 | Layouts sind pro Entität/Layoutname per REST abrufbar (vermutlich `GET api/v1/{Entity}/layout/{name}` oder `GET api/v1/Layout/{scope}/{name}`) | [TRAINING] — exakten Pfad im Netzwerk-Tab des Espo-Web-Clients ermitteln |
| A5 | Listen: `GET api/v1/{Entity}` mit `maxSize`, `offset`, `orderBy`, `order`, `select` und `where`-searchParams; `maxSize`-Obergrenze ~200 | [TRAINING] |
| A6 | Delta-Sync über `where`-Filter auf `modifiedAt` möglich | [TRAINING] |
| A7 | belongsTo-Links liegen als `{link}Id`/`{link}Name` im Datensatz; linkMultiple-Felder liefern `{link}Ids`/`{link}Names`, wenn per `select` angefordert | [TRAINING] |
| A8 | Dynamic Logic liegt in `clientDefs.{Entity}.dynamicLogic.fields.{field}.{visible|required|readOnly}.conditionGroup` als JSON | [TRAINING] |
| A9 | Optimistic Concurrency: Datensätze tragen `versionNumber`; PUT mit veralteter Version ⇒ HTTP 409 | [TRAINING] — Mechanik und ob pro Entität aktivierbar prüfen (Doku: "Optimistic concurrency control") |
| A10 | CORS: Espo sendet standardmäßig keine CORS-Header für fremde Origins | [OFFEN] — an Ziel-Instanz testen |
| A11 | Exakter API-Name der eigenen Entität "Eingangsrechnung" (vermutlich mit `C`-Präfix, z. B. `CEingangsrechnung`) | [OFFEN] — aus Metadata ablesen |

## Tech-Stack (Vorschlag)

- **Vite + React + TypeScript** — schnelles Setup, gute Claude-Code-Unterstützung
- **Dexie.js** (IndexedDB-Wrapper) — für den Prototyp einfacher als SQLite-WASM; Migration auf SQLite-WASM/OPFS als spätere Option offenhalten (Abstraktionsschicht `src/db/`)
- **vite-plugin-pwa** (Workbox) — App-Shell-Caching, Manifest, Installierbarkeit
- **Zustand** für UI-State; schlichtes eigenes CSS, kein UI-Framework
- Konfiguration über `.env` (`VITE_ESPOCRM_URL`, Zugangsdaten **niemals** committen; `.env` in `.gitignore`)

## Projektstruktur (Ziel)

```
src/
  api/espoClient.ts      # fetch-Wrapper, Auth-Header, Fehlerklassen
  db/schema.ts           # Dexie-Stores (siehe unten)
  db/repo.ts             # Zugriffsfunktionen (get/put/query)
  engine/fieldRegistry.tsx  # fieldType -> {DetailCell, EditInput, validate}
  engine/dynamicLogic.ts    # conditionGroup-Evaluator
  engine/DetailView.tsx / EditView.tsx / ListView.tsx
  sync/pull.ts           # Initial- & Delta-Replikation
  sync/push.ts           # Outbox-Replay, Temp-ID-Mapping, Konflikte
  pages/                 # Routing: Entitätsliste -> Liste -> Detail/Edit
fixtures/                # echte API-Antworten aus Phase 0 (anonymisiert)
docs/API-NOTES.md        # verifizierte Pfade, Formate, Limits
```

**Lokales Datenmodell (Dexie-Stores):**

```
meta:      { key, value }                      // metadata, i18n, layouts:{Entity}:{name}, appUser, settings
records:   { entityType+id, data, modifiedAt } // Index: [entityType+modifiedAt]
outbox:    { seq++, tempId?, entityType, op: 'create'|'update',
             payload, baseVersionNumber?, status: 'pending'|'error'|'conflict'|'done', errorMsg? }
idMap:     { tempId, serverId }
syncState: { entityType, lastSyncedModifiedAt }
```

---

## Phase 0 — Annahmen gegen die echte Instanz verifizieren

**Kein Anwendungscode in dieser Phase.** Nur Skripte/curl + Dokumentation.

Aufgaben:

1. `.env.example` anlegen (`VITE_ESPOCRM_URL`, `ESPOCRM_API_KEY` bzw. `ESPOCRM_USER`/`ESPOCRM_TOKEN`).
2. Mit curl (oder kleinem Node-Skript `scripts/probe.mjs`) gegen die Instanz:
   - `GET api/v1/App/user` → Antwort nach `fixtures/app-user.json`
   - `GET api/v1/Metadata` → `fixtures/metadata.json`
   - `GET api/v1/I18n` → `fixtures/i18n.json`
   - Layout-Pfad ermitteln (A4): im Browser den Espo-Web-Client öffnen, Netzwerk-Tab beobachten, echten Pfad notieren, dann per curl für 2 Entitäten × Layouts `detail` + `list` ziehen → `fixtures/layout-*.json`
   - Listen-Request mit Pagination + `where` auf `modifiedAt` testen (A5/A6); genutztes `where`-Format dokumentieren (offizielle Doku-Seite "Search parameters" heranziehen)
   - Ein `PUT` auf einen Testdatensatz mit `versionNumber` testen (A9)
   - CORS von `http://localhost:5173` aus testen (A10); falls blockiert: Vite-Dev-Proxy (`/api` → Instanz) als Lösung dokumentieren, für Produktion "PWA unter gleicher Domain/Reverse-Proxy" notieren
3. Aus `fixtures/metadata.json` ablesen und in `docs/API-NOTES.md` festhalten: exakter Entitätsname der Eingangsrechnung (A11), Feldtypen-Inventar der Scope-Entitäten, vorhandene dynamicLogic-Beispiele (A8), Übersetzungspfad für Enum-Optionen in i18n (vermutlich `{Entity}.options.{field}` — prüfen).

**Akzeptanzkriterien:**
- [ ] Alle Fixtures liegen vor (ggf. sensible Werte geschwärzt).
- [ ] `docs/API-NOTES.md` beantwortet A3–A11 mit konkreten Beispielen.
- [ ] CORS-Strategie ist entschieden und dokumentiert.

---

## Phase 1 — API-Client, Auth, Metadaten-Cache & Offline-Boot

1. Vite-Projekt aufsetzen (React + TS), Dexie-Schema wie oben.
2. `espoClient.ts`: Basis-URL aus `.env`; Auth wahlweise `X-Api-Key` (API-User) oder `Espo-Authorization: Basic base64(user:token)`. Hinweis im Code: API-User erhalten I18n nur in der Systemsprache (A2) — für den Prototyp bei deutscher Systemsprache unkritisch.
3. Boot-Sequenz: wenn online → Metadata, I18n, Settings, App/user, Layouts der Scope-Entitäten laden und in `meta` persistieren (mit Zeitstempel); wenn offline → aus `meta` booten.
4. Simpler Login-/Konfigurationsscreen; Token wird für den Prototyp in IndexedDB gehalten (Sicherheitshinweis als TODO-Kommentar: für Produktion härten).

**Akzeptanz:** App startet online, lädt alles in Dexie; anschließend DevTools → Offline → Reload: App bootet vollständig aus dem Cache (sichtbar: Nutzername, Entitätenliste).

---

## Phase 2 — Rendering-Engine (Kernstück)

1. `fieldRegistry`: Mapping `fieldType → { DetailCell, EditInput, validate }` für: `varchar, text, enum, multiEnum, bool, int, float, currency (vereinfacht: Betrag + Code), date, datetime, email, phone, url, link, linkMultiple`.
   - `link`/`linkMultiple` im Edit-Modus: Auswahl **aus dem lokalen Cache** (Dropdown/Suche über `records`), read-only als Name-Chips.
   - **Fallback-Renderer** für unbekannte Typen (zeigt Rohwert + Typ) — Pflicht, damit die Engine nie crasht.
2. `EditView`/`DetailView`: Layout-JSON (`rows` → `cells`) iterieren; Labels & Enum-Options-Übersetzungen aus I18n (Pfad gemäß API-NOTES); `required`/`maxLength`/`options` aus `entityDefs`.
3. `ListView`: Spalten aus dem `list`-Layout, Daten aus Dexie, Client-seitige Sortierung nach `modifiedAt`.

**Akzeptanz:** Für `Contact` und die Eingangsrechnungs-Entität rendern List-, Detail- und Edit-View ausschließlich aus Fixtures/Cache — ohne eine einzige hartcodierte Feldliste. Pflichtfelder markiert, Enum-Optionen übersetzt, unbekannte Typen fallen sauber zurück.

---

## Phase 3 — Dynamic Logic

1. `dynamicLogic.ts`: Evaluator für `conditionGroup` mit `and`, `or`, `not` und den Operatoren `isEmpty, isNotEmpty, isTrue, isFalse, equals, notEquals, greaterThan, lessThan, greaterThanOrEquals, lessThanOrEquals, in, notIn, contains, has` (Liste gegen echte Beispiele aus Phase 0 abgleichen; unbekannte Operatoren → warnend als `true` auswerten und loggen).
2. Anbindung an `EditView`: bei jeder Feldänderung `visible/required/readOnly` je Feld neu auswerten.
3. Unit-Tests (Vitest) für den Evaluator mit den Fixture-Bedingungen.

**Akzeptanz:** Eine reale Bedingung aus der Instanz (oder Testbedingung "Feld B nur sichtbar wenn A = 'x'") funktioniert live im Formular — offline.

---

## Phase 4 — Replikation (Pull)

1. `pull.ts`: `initialPull(entityType)` — paginierte Listen-Requests (`maxSize` laut API-NOTES, `orderBy=modifiedAt&order=asc`), `select` mit allen Layout-Feldern + `{link}Id`/`{link}Ids`-Attributen; Ergebnisse nach `records`.
2. `deltaPull(entityType)` — `where`-Filter `modifiedAt >= lastSyncedModifiedAt` (Format aus API-NOTES); `syncState` fortschreiben. Überlappung von 1–2 Minuten einbauen (Uhrendrift), Upsert macht das idempotent.
3. Sync-UI: Status je Entität (Anzahl, letzter Sync), manueller "Jetzt synchronisieren"-Button; automatischer Delta-Pull bei `online`-Event und App-Start.
4. **Bekannte Lücke dokumentieren** (nicht bauen): Löschungen und ACL-Entzug sind per Delta unsichtbar → späterer ID-Abgleich oder Custom-Endpoint.

**Akzeptanz:** ≥ 1.000 Datensätze einer Entität werden paginiert repliziert; ein in Espo geänderter Datensatz erscheint nach Delta-Pull lokal; Liste + Detail sind im Flugmodus nutzbar.

---

## Phase 5 — Outbox & Sync zurück (Push)

1. Speichern im `EditView` schreibt **sofort lokal** (optimistic) und legt eine Outbox-Operation an (`update` mit geändertem Teil-Payload + `baseVersionNumber`; `create` mit `tempId = 'tmp_' + nanoid()`).
2. `push.ts`: Replay strikt sequenziell in `seq`-Reihenfolge bei `online`-Event, App-Start und manuellem Button. **Kein** Verlass auf die Background Sync API — auf iOS/Safari nicht zuverlässig verfügbar (daher: Sync beim Öffnen).
3. Nach erfolgreichem `create`: `idMap` füllen und `tempId`-Referenzen in noch wartenden Operationen ersetzen (z. B. offline erzeugter Account → offline erzeugter Kontakt mit `accountId`). Creates topologisch vor abhängigen Operationen einreihen.
4. Fehlerbehandlung: HTTP 409 → `status='conflict'` + einfacher Dialog ("Server-Stand übernehmen" verwirft lokale Änderung und pullt neu / "Meine Änderung erneut senden" überschreibt mit frischer `versionNumber`). HTTP 400/403 (Server-Validierung, Formeln, ACL) → `status='error'`, Fehlermeldung im UI, Operation editierbar/verwerfbar. Netzwerkfehler → bleibt `pending`, Retry mit Backoff.

**Akzeptanz (Demo-Drehbuch):** Flugmodus an → 1 Datensatz ändern + 1 neuen anlegen → Flugmodus aus → beide Änderungen erscheinen korrekt in EspoCRM, die Temp-ID wurde durch die Server-ID ersetzt, die Outbox ist leer. Konfliktfall (Datensatz parallel im Web-Client ändern) zeigt den Dialog.

---

## Phase 6 — PWA-Feinschliff

1. `vite-plugin-pwa`: Manifest (Name, Icons, Farben), Precache der App-Shell, `registerType: 'autoUpdate'`.
2. Offline-/Online-Indikator in der Kopfzeile; Badge mit Anzahl offener Outbox-Einträge.
3. Kurzer Abschnitt in `README.md`: Deployment-Empfehlung gleiche Domain/Reverse-Proxy (CORS), bekannte Grenzen (Nicht-Ziele oben).

**Akzeptanz:** App ist installierbar (Chrome/Android geprüft); Kaltstart im Flugmodus zeigt gecachte Daten und die Outbox.

---

## Risiken & bewusst Offenes (nach dem Prototyp)

- **Löschungen/ACL-Entzug:** periodischer ID-Abgleich (nur IDs paginiert ziehen, lokal diffen) oder kleiner Custom-Endpoint/Webhooks serverseitig.
- **Many-to-many ohne Feld:** Custom-Endpoint, der die Relationstabelle als Liste ausgibt.
- **Serverseitige Logik** (Formeln, Workflows, Pflichtprüfungen) greift erst beim Push — Nutzererwartung im UI managen.
- **Token-Sicherheit** im Browser-Storage; Datenvolumen (E-Mails/Stream ausklammern); Mandanten-/Mehrgeräte-Szenarien.

## Offene Entscheidungen — bitte vor Phase 0 ausfüllen

- Instanz-URL: `__________`
- Auth-Art: API-Key (API-User) ☐ / Nutzer-Token ☐
- Entitäten-Scope (Vorschlag): `Contact`, `Account`, `Task`, `<Eingangsrechnung — exakter Name aus Phase 0>` — anpassen: `__________`
- Testdatensatz-IDs für Phase-0-Schreibtests (kein Produktivdatensatz!): `__________`
