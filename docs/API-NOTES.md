# API-NOTES — verifizierte Pfade, Formate, Limits (Phase 0)

> Status-Legende: ✅ an der Instanz verifiziert · 📚 per offizieller Doku belegt ·
> ⚠️ Abweichung von der Plan-Annahme · ⏳ offen / nicht abschließend geklärt.
>
> **Verifiziert am:** 2026-07-26 gegen `http://emayr.local` (Probe-Lauf:
> [`fixtures/probe-report.txt`](../fixtures/probe-report.txt), erzeugt von
> `scripts/probe.mjs`). Diese Befunde sind gegenüber den Annahmen in PLAN.md
> **verbindlich**.
>
> **Hinweis zu den Fixtures:** Der Probe-Lauf fand auf dem Entwicklerrechner
> statt (die Instanz ist nur im lokalen Netz erreichbar). Bisher liegt nur der
> Report im Repo; die JSON-Fixtures müssen noch aus dem lokalen `fixtures/`
> übernommen werden (siehe [fixtures/README.md](../fixtures/README.md)).

## Basis

- Base-URL: `http://emayr.local/api/v1/` (aus `.env`, `VITE_ESPOCRM_URL`)
- Auth (📚 [API Authentication](https://docs.espocrm.com/development/api/#authentication)):
  - API-User: Header `X-Api-Key: {key}`
  - Regulärer Nutzer: `Espo-Authorization: Basic base64(user:passwordOrToken)`
- Fehlerdetails liefert Espo im Response-Header `X-Status-Reason`.
- Instanzgröße: 22 Entitäten (schlanke Installation).

## A3 — `GET App/user` ✅

Top-Level-Keys der Antwort:

```
user, acl, preferences, token, settings, language, appParams
```

- `user.userName` vorhanden ✅ → für den Offline-Boot-Nachweis (Phase 1) nutzbar.
- `token` wird mitgeliefert → für die Prototyp-Persistenz in IndexedDB relevant
  (Sicherheitshinweis in PLAN.md Phase 1 beachten).
- `language` und `settings` kommen aus demselben Call → ein Request genügt für
  den kompletten App-Kontext.
- `acl`-Keys:
  `table`, `fieldTable`, `fieldTableQuickAccess`, `assignmentPermission`,
  `messagePermission`, `mentionPermission`, `userCalendarPermission`,
  `auditPermission`, `exportPermission`, `massUpdatePermission`,
  `userPermission`, `portalPermission`, `groupEmailAccountPermission`,
  `followerManagementPermission`, `dataPrivacyPermission`
  → Scope-Rechte in `acl.table`, Feldrechte in `acl.fieldTable`.

## A4 — Layout-Endpunkt ✅

```
GET api/v1/{Entity}/layout/{name}      → HTTP 200
```

Der erste Kandidat trifft zu; `Layout/{scope}/{name}` wurde nicht benötigt.
Geprüft für `CPruefberichte` mit `detail` und `list`
(→ `fixtures/layout-CPruefberichte-detail.json`, `-list.json`).

## A5 — Listen: Pagination & Parameter ✅ (Limit ⏳)

- Antwortform: `{ total, list: [...] }` ✅
- Parameter `maxSize`, `offset`, `orderBy`, `order`, `select` (kommasepariert)
  funktionieren wie erwartet ✅
- `maxSize`-Obergrenze ⏳ **teilweise geklärt**: `maxSize=500` wurde mit
  **HTTP 200** beantwortet — die Instanz weist große Werte also *nicht* mit
  HTTP 403 (`X-Status-Reason: Max size should not exceed …`) ab. Die vermutete
  Grenze von ~200 gilt hier somit nicht bzw. liegt höher.
  Offen bleibt, ob eine Seite tatsächlich >200 Datensätze ausliefert: die
  Testentität `CPruefberichte` enthält nur **1** Datensatz.
  → Der Probe-Lauf tastet das Limit inzwischen als Leiter ab
  (200 → 500 → 1000 → 5000) und wählt automatisch die datenreichste
  Scope-Entität. Vor Phase 4 nachtesten; bis zum Gegenbeweis
  **konservativ `maxSize=200`** verwenden.

## A6 — Delta-Sync über `modifiedAt` ✅

Funktionierendes `where`-Format als Query-String:

```
where[0][type]=after
where[0][attribute]=modifiedAt
where[0][value]=YYYY-MM-DD HH:MM:SS
```

Getestet mit `value=2026-06-26 13:47:47` → HTTP 200, `total=1` ✅
(📚 [Search parameters](https://docs.espocrm.com/development/api-search-params/))

- Wert ohne `T`/`Z`, Format `YYYY-MM-DD HH:MM:SS`; das Skript übergibt UTC
  (`toISOString()` gekürzt). Espo speichert `modifiedAt` in UTC — beim
  Delta-Pull konsequent UTC senden.
- `after` ist **exklusiv** (streng größer) → die in PLAN.md Phase 4 vorgesehene
  Überlappung von 1–2 Minuten plus idempotentes Upsert beibehalten.

## A7 — Beziehungsattribute im Datensatz ✅

Im Listen-Ergebnis mit `select=…,assignedUserId,assignedUserName,teamsIds,teamsNames`:

| Attribut | vorhanden |
|---|---|
| `assignedUserId` (belongsTo) | ✅ |
| `assignedUserName` | ✅ |
| `teamsIds` (linkMultiple) | ✅ |
| `teamsNames` | ✅ |

→ Annahme bestätigt: `link` → `{link}Id`/`{link}Name`, `linkMultiple` →
`{link}Ids`/`{link}Names`, sofern per `select` angefordert.

## A8 — Dynamic Logic ✅ (teilweise)

- Pfad `clientDefs.{Entity}.dynamicLogic` bestätigt ✅
- Auf dieser Instanz nutzt **nur `CEmayrQrs`** Dynamic Logic
  (→ `fixtures/dynamic-logic-examples.json`).
- ⏳ Die konkret verwendeten Operatoren sind aus dem Report nicht ersichtlich und
  müssen vor Phase 3 aus dem Fixture ausgelesen werden. Der Evaluator bekommt
  ohnehin einen Fallback (unbekannter Operator → `true` + Warnung).
- ℹ️ `Metadata` hat zusätzlich den Top-Level-Key **`logicDefs`** — im Fixture
  prüfen, ob dort (Espo 9/10) Bedingungen liegen, die `clientDefs.dynamicLogic`
  ergänzen oder ablösen.

## A9 — Optimistic Concurrency ⚠️ **Annahme widerlegt**

- `versionNumber` ist im Datensatz **nicht enthalten** (`undefined`).
- `PUT` ohne gültige `versionNumber` → **HTTP 200**, die Änderung geht durch.
- Der 409-Gegentest wurde vom Skript übersprungen, weil keine numerische
  Ausgangsversion vorlag.

**Konsequenz für Phase 5:** Es gibt auf dieser Instanz derzeit **keinen
Server-seitigen Konfliktschutz** — Standard ist Last-write-wins. Zwei Optionen:

1. **Feature aktivieren** (bevorzugt für die Konflikt-Demo): In Espo
   *Administration → Entity Manager → {Entität} → Optimistic Concurrency Control*
   einschalten; danach A9 erneut proben. Erst dann liefert der Server 409 und
   der in PLAN.md Phase 5 geplante Konfliktdialog ist realistisch auslösbar.
2. **Fallback ohne Server-Support:** `modifiedAt` des lokalen Ausgangsstands
   mitführen und vor dem Push mit dem Server-Stand vergleichen (Read-before-write).
   Das ist ein Race, kein echter Schutz — nur als dokumentierte Prototyp-Grenze.

→ **Entscheidung erforderlich** (siehe „Offene Punkte" unten).

## A10 — CORS ⚠️ blockiert → Strategie entschieden

- `OPTIONS`-Preflight mit `Origin: http://localhost:5173` → HTTP 200,
  **aber kein `Access-Control-Allow-Origin`-Header**. Der Browser blockiert
  damit jeden Cross-Origin-Request aus der PWA.

**Entschiedene Strategie:**

- **Entwicklung:** Vite-Dev-Proxy — alle App-Requests gehen an den relativen
  Pfad `/api/...`, Vite leitet weiter:

  ```ts
  // vite.config.ts (Phase 1)
  server: {
    proxy: {
      '/api': { target: process.env.VITE_ESPOCRM_URL, changeOrigin: true },
    },
  }
  ```

  Der `espoClient` verwendet damit im Dev-Betrieb eine **relative** Base-URL —
  kein CORS, keine Preflights.
- **Produktion:** PWA unter derselben Domain wie EspoCRM ausliefern (bzw. hinter
  demselben Reverse-Proxy) — same-origin, damit entfällt CORS dauerhaft. Eine
  serverseitige CORS-Öffnung ist ausdrücklich **nicht** vorgesehen.

## A11 — Entität „Eingangsrechnung" ⚠️ **existiert nicht auf dieser Instanz**

Custom-Entitäten (C-Präfix) laut `metadata.json`:

```
CArtikel, CEmayrQrs, CEmayrTracks, CKundenbaustellen, CLieferscheine, CPruefberichte
```

Es gibt **keine Eingangsrechnungs-Entität**. Die Instanz bildet eine andere
Domäne ab (Prüfberichte, Lieferscheine, Artikel, Kundenbaustellen).

→ **Scope-Anpassung nötig.** Als Ersatz für die Rolle „fachlich reiche
Custom-Entität" bietet sich **`CPruefberichte`** an: viele Feldtypen, Links,
Enums und als einzige geprüfte Entität mit vollständigem Layout-Satz.
`CEmayrQrs` ist als **zweite** Entität interessant, weil dort die einzige
Dynamic Logic der Instanz hängt (Phase 3). Siehe „Offene Punkte".

## Feldtypen-Inventar `CPruefberichte`

```
varchar(6), text(2), datetime(3), date(3), enum(4), bool(2),
link(6), linkMultiple(1), checklist(3), image(1), email(1)
```

⚠️ **Relevant für Phase 2:** Die Typen **`checklist`** (3 Felder!) und **`image`**
stehen nicht auf der Registry-Liste in PLAN.md Phase 2.

- `checklist` — häufig genug, um einen echten Renderer zu rechtfertigen
  (Mehrfachauswahl-Set aus `options`, ähnlich `multiEnum`).
- `image` — fällt unter das Nicht-Ziel „Attachments/Dateien"; bewusst über den
  **Fallback-Renderer** abbilden (Rohwert + Typ), nicht implementieren.

Umgekehrt kamen `int`, `float`, `currency`, `phone`, `url` und `multiEnum` in
dieser Entität nicht vor — die Registry-Einträge dafür bleiben trotzdem sinnvoll
(andere Entitäten/Standardfelder), sind aber nicht die Priorität.

## I18n: Enum-Options-Übersetzungen ✅

Pfad `{Entity}.options.{field}.{value}` bestätigt. Für `CPruefberichte` liegen
Options vor für:

```
dosierung, maschine, ersatzteile, ersatzteileDosiergeraete,
ersatzteileSpraystation, ersatzteileAbfuellstation, status
```

I18n-Scopes umfassen u. a. `Global`, `User`, `Preferences`, `Stream`,
`CLieferscheine`, `CPruefberichte` — Labels also pro Entität abrufbar.
Fallback-Kette für die Engine: `{Entity}.options.{field}` → `Global.options.{field}` → Rohwert.

## Offene Punkte / Entscheidungen für Phase 1

1. **Entitäten-Scope festlegen** (ersetzt „Eingangsrechnung" aus PLAN.md).
   Vorschlag: `CPruefberichte` (Renderer-Breite) + `CEmayrQrs` (Dynamic Logic),
   optional `CLieferscheine`. Ob `Contact`/`Account` auf dieser Instanz
   überhaupt aktiv sind, aus `metadata.json` bestätigen.
2. **A9-Entscheidung:** Optimistic Concurrency Control im Entity Manager
   aktivieren (dann A9 nachproben) — oder Konflikterkennung als dokumentierte
   Prototyp-Grenze führen.
3. **`maxSize`-Limit** mit einer datenreichen Entität nachtesten (der zweite
   Probe-Lauf erledigt das automatisch); bis dahin 200.
4. **JSON-Fixtures** aus dem lokalen Lauf ins Repo übernehmen — sie sind die
   Grundlage der Phase-2-Engine und der Phase-3-Unit-Tests.
5. **`logicDefs`** im Metadata-Fixture inspizieren (siehe A8).
