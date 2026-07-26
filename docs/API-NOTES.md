# API-NOTES — verifizierte Pfade, Formate, Limits (Phase 0)

> Status-Legende: ✅ an der Instanz verifiziert · 📚 per offizieller Doku belegt ·
> ⚠️ Abweichung von der Plan-Annahme · ⏳ offen / nicht abschließend geklärt.
>
> **Verifiziert am:** 2026-07-26 gegen `http://emayr.local`, zwei Läufe
> (zuletzt 14:13 UTC mit dem Scope `CPruefberichte,CEmayrQrs`; Report:
> [`fixtures/probe-report.txt`](../fixtures/probe-report.txt), erzeugt von
> `scripts/probe.mjs`). Diese Befunde sind gegenüber den Annahmen in PLAN.md
> **verbindlich**.
>
> **Hinweis zu den Fixtures:** Die Probe-Läufe fanden auf dem Entwicklerrechner
> statt (die Instanz ist nur im lokalen Netz erreichbar). Bisher liegt nur der
> Report im Repo; die JSON-Fixtures müssen noch aus dem lokalen `fixtures/`
> übernommen werden (siehe [fixtures/README.md](../fixtures/README.md)).
>
> **Noch nicht nachgeprüft:** Beide Läufe nutzten die Skriptversion *vor* den
> Nachschärfungen (Commit `7fafedd`). Die dort ergänzten Auswertungen —
> `maxSize`-Leiter, Operator-Liste für den Evaluator, `logicDefs`,
> Feldtypen-Zensus, expliziter A9-Befund — liefert erst der nächste Lauf.

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
Geprüft für **beide Scope-Entitäten** mit `detail` und `list` — alle vier
Layouts liegen vor (→ `fixtures/layout-CPruefberichte-{detail,list}.json`,
`fixtures/layout-CEmayrQrs-{detail,list}.json`). Damit sind für Phase 2 zwei
vollständige Layout-Sätze zum Rendern vorhanden.

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
  (→ `fixtures/dynamic-logic-examples.json`) — in beiden Läufen bestätigt.
  `CEmayrQrs` ist deshalb im Scope: ohne diese Entität hätte Phase 3 keine
  echte Bedingung zum Testen.
- ⏳ Die konkret verwendeten Operatoren sind aus dem Report nicht ersichtlich und
  müssen vor Phase 3 aus dem Fixture ausgelesen werden. Der Evaluator bekommt
  ohnehin einen Fallback (unbekannter Operator → `true` + Warnung).
- ℹ️ `Metadata` hat zusätzlich den Top-Level-Key **`logicDefs`** — im Fixture
  prüfen, ob dort (Espo 9/10) Bedingungen liegen, die `clientDefs.dynamicLogic`
  ergänzen oder ablösen.

## A9 — Optimistic Concurrency ⏳ Neutest ausstehend

Optimistic Concurrency **ist auf der Instanz aktiv**. Die ersten beiden
Probe-Läufe konnten das nicht zeigen, weil der Test methodisch falsch war:

> Espo meldet einen Konflikt nur, wenn die veraltete Version mit einer
> **echten Wertänderung** kombiniert wird. Steht Feld `O` auf `A`, wird
> serverseitig auf `B` geändert und schickt ein alter Client `O=C` mit der
> alten Version, kommt HTTP 409. Schreibt der Client dagegen den **unveränderten**
> Wert zurück, geht der Request auch mit alter Version durch.

Der alte Test schrieb `name` unverändert zurück (bewusst non-destructive) und
konnte den Konflikt daher prinzipiell nie auslösen. HTTP 200 war korrektes
Server-Verhalten, kein Hinweis auf ein fehlendes Feature.

**Umgebauter Test** (`scripts/probe.mjs`, Schritte im Report nummeriert):

1. `PUT {feld: A}` mit aktueller `versionNumber` → erzeugt eine neue Version;
   `versionNumber` wird aus dem **PUT-Response** gelesen (der GET-Response
   enthielt sie in den bisherigen Läufen nicht).
2. `PUT {feld: B}` — abweichender Wert — mit der **veralteten** `versionNumber`
   → hier muss HTTP 409 kommen.
3. Aufräumen: Ausgangswert mit frischer Version zurückschreiben.

Das Testfeld ist ein Textfeld (`description`/`comment`/`notes`, sonst das erste
beschreibbare `varchar`/`text`-Feld; überschreibbar per `ESPOCRM_TEST_FIELD`);
`name` wird gemieden. Der Ausgangswert steht im Report, falls ein Abbruch das
Aufräumen verhindert. Beide Varianten — `versionNumber` im GET vorhanden bzw.
nur im PUT-Response — sind gegen einen Mock verifiziert.

**Offen:** Bestätigung durch einen echten Lauf, dazu die Frage, ob `versionNumber`
im GET-Response fehlt (dann muss der Client sie beim Laden separat beschaffen —
relevant für `baseVersionNumber` in der Outbox, PLAN.md Phase 5).

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

→ **Scope-Anpassung erfolgt.** An die Stelle der Eingangsrechnung treten:

| Entität | Rolle im Prototyp |
|---|---|
| `CPruefberichte` | fachlich reiche Entität: 11 Feldtypen, 6 `link`-Felder, 4 Enums mit übersetzten Options |
| `CEmayrQrs` | einzige Entität mit Dynamic Logic → Grundlage für Phase 3 |

Beide sind mit dem Lauf vom 14:13 UTC vollständig geprobt (Layouts, Feldtypen,
I18n). `CLieferscheine` bliebe als dritte Entität verfügbar, wird für die
Akzeptanzkriterien aber nicht gebraucht.

## Feldtypen-Inventar der Scope-Entitäten

| Typ | `CPruefberichte` | `CEmayrQrs` | in PLAN.md Phase 2 vorgesehen |
|---|---|---|---|
| `varchar` | 6 | 4 | ✅ |
| `text` | 2 | 1 | ✅ |
| `datetime` | 3 | 3 | ✅ |
| `date` | 3 | – | ✅ |
| `enum` | 4 | – | ✅ |
| `bool` | 2 | 1 | ✅ |
| `link` | 6 | 3 | ✅ |
| `linkMultiple` | 1 | 1 | ✅ |
| `email` | 1 | – | ✅ |
| `checklist` | 3 | – | ⚠️ **fehlt** |
| `image` | 1 | – | ⚠️ **fehlt** |
| `barcode` | – | 1 | ⚠️ **fehlt** |

⚠️ **Relevant für Phase 2 — drei Typen fehlen in der Registry-Liste:**

- **`checklist`** (3 Felder) — häufig genug für einen echten Renderer:
  Mehrfachauswahl-Set aus `options`, im Prinzip wie `multiEnum`. Da `multiEnum`
  auf dieser Instanz gar nicht vorkommt, ersetzt `checklist` es faktisch.
- **`image`** — fällt unter das Nicht-Ziel „Attachments/Dateien". Bewusst über
  den **Fallback-Renderer** abbilden (Rohwert + Typ), nicht implementieren.
- **`barcode`** — Einzelfeld in `CEmayrQrs`; im Detail-Modus als Text
  darstellbar, im Edit-Modus wie `varchar` behandelbar. Ein echter
  Barcode-/QR-Renderer ist für den Prototyp nicht nötig.

Damit ist der Fallback-Renderer aus PLAN.md Phase 2 keine reine Vorsichtsmaßnahme,
sondern wird von dieser Instanz **real gebraucht** — ein guter Testfall für die
Zusicherung „die Engine crasht nie".

Nicht vorhanden in beiden Scope-Entitäten: `int`, `float`, `currency`, `phone`,
`url`, `multiEnum`. Die Registry-Einträge dafür bleiben sinnvoll (Standardfelder
anderer Entitäten), haben aber keine Priorität. Ein instanzweiter Feldtypen-Zensus
folgt mit dem nächsten Probe-Lauf.

## I18n: Enum-Options-Übersetzungen ✅

Pfad `{Entity}.options.{field}.{value}` bestätigt. Für `CPruefberichte` liegen
Options vor für:

```
dosierung, maschine, ersatzteile, ersatzteileDosiergeraete,
ersatzteileSpraystation, ersatzteileAbfuellstation, status
```

`CEmayrQrs` hat **keinen** `options`-Block — konsistent, denn die Entität
enthält keine `enum`-Felder. Die Übersetzungskette wird also nur über
`CPruefberichte` ausgeübt.

⏳ Zu prüfen: Die drei `checklist`-Felder von `CPruefberichte` erscheinen
**nicht** unter den `options`-Feldern. Im `i18n.json`-Fixture nachsehen, wo
deren Auswahlwerte übersetzt sind (evtl. eigener Block oder nur in
`entityDefs.…fields.{field}.options`) — relevant für den `checklist`-Renderer.

I18n-Scopes umfassen u. a. `Global`, `User`, `Preferences`, `Stream`,
`CLieferscheine`, `CPruefberichte` — Labels also pro Entität abrufbar.
Fallback-Kette für die Engine: `{Entity}.options.{field}` → `Global.options.{field}` → Rohwert.

## Offene Punkte / Entscheidungen für Phase 1

1. ✅ **Entitäten-Scope festgelegt:** `CPruefberichte` + `CEmayrQrs`
   (siehe A11). Ersetzt „Eingangsrechnung" aus PLAN.md.
2. **A9 nachproben** mit dem umgebauten Schreibtest (echte Wertänderung +
   veraltete Version). Erwartet: HTTP 409. Ergebnis hier eintragen, insbesondere
   ob `versionNumber` im GET-Response mitkommt.
3. **Datenlage für Phase 4:** `CPruefberichte` enthält aktuell **1 Datensatz**.
   Das Akzeptanzkriterium „≥ 1.000 Datensätze paginiert repliziert" ist so nicht
   erfüllbar. Optionen: Testdaten in der Instanz anlegen, eine datenreichere
   Entität in den Scope nehmen, oder das Kriterium bewusst absenken.
   Zugleich bleibt damit das `maxSize`-Limit ungeklärt (bis dahin 200).
4. **JSON-Fixtures** aus dem lokalen Lauf ins Repo übernehmen — sie sind die
   Grundlage der Phase-2-Engine und der Phase-3-Unit-Tests.
5. **Aus den Fixtures nachtragen** (oder per erneutem Probe-Lauf mit der
   aktuellen Skriptversion automatisch): verwendete `conditionGroup`-Operatoren,
   Inhalt von `logicDefs` (A8), Übersetzungsort der `checklist`-Options.
