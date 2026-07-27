# API-NOTES — verifizierte Pfade, Formate, Limits (Phase 0)

> Status-Legende: ✅ an der Instanz verifiziert · 📚 per offizieller Doku belegt ·
> ⚠️ Abweichung von der Plan-Annahme · ⏳ offen / nicht abschließend geklärt.
>
> **Verifiziert am:** 2026-07-26 gegen `http://emayr.local`, Scope
> `CPruefberichte,CEmayrQrs`; maßgeblich ist der Lauf um 21:12 UTC
> ([`fixtures/probe-report.txt`](../fixtures/probe-report.txt), erzeugt von
> `scripts/probe.mjs`). Diese Befunde sind gegenüber den Annahmen in PLAN.md
> **verbindlich**.
>
> **Phase 0 ist damit abgeschlossen:** A3–A11 sind beantwortet, alle Fixtures
> liegen im Repo (siehe [fixtures/README.md](../fixtures/README.md)), die
> CORS-Strategie ist entschieden. Offen ist nur noch eine **Datenqualitätsfrage**
> zu den eingespielten Testdaten (siehe „Datenlage" unten) — kein API-Befund.

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
- `maxSize`-Obergrenze ✅ **geklärt** (mit 10.001 Datensätzen in
  `CPruefberichte` nachgemessen):

  | `maxSize` | Status | gelieferte Datensätze |
  |---|---|---|
  | 200 | 200 | 200 |
  | 500 | 200 | 500 |
  | 1000 | 200 | 1000 |
  | 5000 | 200 | 5000 |

  Die Instanz kappt **nicht** — die in PLAN.md vermutete Grenze von ~200
  existiert hier nicht, und die Seiten werden auch real gefüllt.
  → Die Seitengröße ist damit eine **Design-Entscheidung**, keine Restriktion.
  Empfehlung für Phase 4: **500** pro Seite (21 Requests für 10.001 Datensätze)
  — groß genug für zügige Replikation, klein genug, dass ein Abbruch wenig
  Arbeit kostet und der Speicher beim JSON-Parsen nicht unnötig belastet wird.

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

⚠️ **`NULL`-`modifiedAt` schlägt auf den Delta-Sync durch.** Im Lauf mit 10.001
Datensätzen liefert der Delta-Filter weiterhin `total=1`: die 10.000
eingespielten Testdatensätze haben `modifiedAt = null` (ebenso `createdAt`),
weil sie an Espos ORM vorbei direkt in die Datenbank geschrieben wurden. Ein
`after`-Vergleich schließt `NULL` aus — für den Delta-Pull sind diese
Datensätze also **unsichtbar**. Konsequenzen und Empfehlungen unter
„Datenlage" am Ende.

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

## A8 — Dynamic Logic ⚠️ **Quelle korrigiert: `logicDefs`**

Die Annahme aus PLAN.md (`clientDefs.{Entity}.dynamicLogic`) greift zu kurz.
Maßgeblich ist der Top-Level-Key **`logicDefs`**:

```
logicDefs.{Entity}.fields.{field}.{visible|readOnly|required}.conditionGroup
```

| Quelle | Inhalt auf dieser Instanz |
|---|---|
| `clientDefs.{Entity}.dynamicLogic` | nur `CEmayrQrs` (1 Feld) |
| `logicDefs.{Entity}` | `EmailAccount`, `EmailFilter`, `Preferences`, `Template`, `User`, **`CPruefberichte`**, `CEmayrQrs` |

**`CPruefberichte` hat 11 Felder mit Dynamic Logic — ausschließlich in
`logicDefs`.** Würde die Engine nur `clientDefs.dynamicLogic` lesen, bliebe die
gesamte Logik der Hauptentität unsichtbar.

→ **Für Phase 3:** primär `logicDefs` lesen, `clientDefs.{Entity}.dynamicLogic`
als Fallback mergen (bei `CEmayrQrs` sind beide inhaltsgleich).

Felder mit Logik in `logicDefs.CPruefberichte`:

| Feld | Regeln |
|---|---|
| `sonstiges`, `ersatzteileAbfuellstation`, `ersatzteileDosiergeraete`, `ersatzteileSpraystation`, `sonstigesErsatzteileSpraystation` | `visible` + `readOnly` |
| `cLieferschein`, `dosierung`, `anmerkungDosierung`, `anmerkungMaschine`, `maschine`, `ersatzteile` | `readOnly` |

**Tatsächlich verwendete Operatoren** (Pflichtumfang des Evaluators):

```
and, or, equals, has, in, isEmpty, isNotEmpty, isTrue, isFalse
```

Die Plan-Liste enthält darüber hinaus `not`, `notEquals`, `greaterThan`,
`lessThan`, `greaterThanOrEquals`, `lessThanOrEquals`, `notIn`, `contains` —
auf dieser Instanz ungenutzt, aber billig mitzunehmen. Der Fallback für
unbekannte Operatoren (→ `true` + Warnung) bleibt Pflicht.

Zwei reale Beispiele für die Unit-Tests (aus `fixtures/dynamic-logic-examples.json`):

```jsonc
// sonstiges.visible — verschachteltes or + has auf einem checklist-Feld
{ "type": "or", "value": [
    { "type": "has", "attribute": "ersatzteileDosiergeraete", "value": "Sonstiges" } ] }

// sonstiges.readOnly — sperrt das Formular nach dem Signieren
{ "type": "equals", "attribute": "status", "value": "signed" }
```

Beachtenswert: `has` operiert auf einem **`checklist`**-Feld — der Evaluator muss
Array-Werte verstehen, und der `checklist`-Renderer aus Phase 2 liefert die
Datengrundlage dafür.

## A9 — Optimistic Concurrency ✅ **vollständig bestätigt**

Nachgewiesen im Lauf vom 21:12 UTC:

```
[1] PUT maschine="in ordnung"    mit X-Version-Number=26            -> HTTP 200  (neue Version 27)
[2] PUT maschine="nicht geprüft" mit veraltetem X-Version-Number=26 -> HTTP 409
[3] Aufräumen: maschine zurück                                      -> HTTP 200
```

Der Konfliktdialog aus PLAN.md Phase 5 ist damit real auslösbar.

Details:

- `metadata.entityDefs.CPruefberichte.optimisticConcurrencyControl = true` ✅
- `versionNumber` liegt im **GET-Response** des Datensatzes (Wert `15`) ✅
  → Der Client kann `baseVersionNumber` für die Outbox (Phase 5) direkt beim
  Replizieren mitnehmen; kein Zusatz-Request nötig.
- ⚠️ **Die Version wird im HTTP-Header `X-Version-Number` gesendet, nicht im
  Payload.** Ein `versionNumber`-Feld im PUT-Body wird ignoriert — der Request
  liefe dann ohne Konfliktprüfung durch. Das ist der Punkt, an dem der
  `espoClient` in Phase 5 aufsetzen muss:

  ```
  PUT api/v1/{Entity}/{id}
  X-Version-Number: 15
  { "maschine": "fehlerhaft" }        // Version NICHT im Body
  ```

Bis dahin waren drei Testvarianten fehlerhaft — der Weg dorthin, damit die
Semantik dokumentiert bleibt:

> Espo meldet einen Konflikt nur, wenn die veraltete Version mit einer
> **echten Wertänderung** kombiniert wird. Steht Feld `O` auf `A`, wird
> serverseitig auf `B` geändert und schickt ein alter Client `O=C` mit der
> alten Version, kommt HTTP 409. Schreibt der Client dagegen den **unveränderten**
> Wert zurück, geht der Request auch mit alter Version durch.

1. **Lauf 1+2:** schrieben `name` unverändert zurück (bewusst non-destructive)
   und konnten den Konflikt prinzipiell nie auslösen. HTTP 200 war korrektes
   Server-Verhalten, kein Hinweis auf ein fehlendes Feature.
2. **Lauf 3:** Testfeld war `maschine` — ein **`enum`**. Der Test hängte einen
   Marker an den Wert (`"in ordnung [probe-A-…]"`), was die Server-Validierung
   zu Recht mit **HTTP 400** ablehnte:
   `Field validation failure; field: maschine, type: valid.`

**Umgebauter Test** (`scripts/probe.mjs`, Schritte im Report nummeriert):

1. `PUT {feld: A}` mit `X-Version-Number` der aktuellen Version → neue Version.
2. `PUT {feld: B}` — abweichender Wert — mit **veraltetem** `X-Version-Number`
   → hier muss HTTP 409 kommen.
3. Aufräumen: Ausgangswert mit frischem `X-Version-Number` zurückschreiben.

Die Testwerte richten sich jetzt nach dem **Feldtyp**: bei `enum` zwei
verschiedene gültige Optionen, bei `checklist`/`multiEnum`/`array` zwei
Options-Arrays, bei `bool` das Umschalten, nur bei `varchar`/`text` ein
angehängter Marker (unter Beachtung von `maxLength`). Wird ein Schreibversuch
abgelehnt, probiert das Skript automatisch das **nächste Kandidatenfeld** —
`ESPOCRM_TEST_FIELD` steht dabei an erster Stelle, `readOnly`- und
`notStorable`-Felder bleiben außen vor. Ein leerer Ausgangswert wird als `null`
zurückgeschrieben (`""` ist für Enums ungültig).

ℹ️ Der Testdatensatz (`CPruefberichte`, id `1`) steht durch die Probe-Läufe auf
`maschine = "fehlerhaft"`; vor Beginn war es `"in ordnung"`. Ein abgebrochener
Lauf hat den Ausgangswert nicht zurückgeschrieben. Für einen Testdatensatz
unkritisch, aber gut zu wissen.

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
anderer Entitäten), haben aber keine Priorität.

### Feldtypen instanzweit (alle 22 Entitäten)

```
varchar(78), link(58), bool(51), datetime(39), enum(32), linkMultiple(23),
text(17), int(16), jsonObject(11), float(10), linkParent(9), array(8),
jsonArray(7), checklist(5), password(4), date(4), enumInt(4), wysiwyg(4),
autoincrement(3), foreign(3), email(3), multiEnum(2), personName(2), phone(2),
image(2), id(1), file(1), attachmentMultiple(1), base(1), colorpicker(1),
url(1), address(1), map(1), barcode(1)
```

Die Registry aus PLAN.md deckt die **fünf häufigsten** Typen ab. Für den
Prototyp genügt der Scope; landen später weitere Entitäten in der App, fallen
`linkParent`, `jsonObject`, `array`, `enumInt`, `wysiwyg`, `autoincrement`,
`foreign`, `personName` und `address` in den Fallback-Renderer. **`currency`
existiert auf dieser Instanz gar nicht** — der in PLAN.md vorgesehene
(vereinfachte) Currency-Renderer ist damit unnötig.

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

✅ **`checklist`-Optionen liegen am selben Ort** wie Enum-Optionen — die drei
Felder `ersatzteileDosiergeraete`, `ersatzteileSpraystation` und
`ersatzteileAbfuellstation` stehen mit unter `CPruefberichte.options`. Der
`checklist`-Renderer kann dieselbe Übersetzungsfunktion nutzen wie `enum`.

Beispiele aus dem Fixture:

```jsonc
"CPruefberichte": {
  "fields":  { "sonstiges": "Sonstiges Ersatzteile Dosiergeräte", "bemerkungen": "Bemerkungen" },
  "options": {
    "maschine": { "in ordnung": "in Ordnung", "fehlerhaft": "fehlerhaft", "nicht geprüft": "nicht geprüft" },
    "ersatzteileDosiergeraete": { "Schlauch": "Schlauch", "Pumpe": "Pumpe", … }
  }
}
```

**Feld-Labels** stehen unter `{Entity}.fields.{field}` — das ist die Quelle für
die Beschriftungen in Detail-, Edit- und List-View. Zu beachten: Optionswerte
können Leerzeichen und Umlaute enthalten (`"nicht geprüft"`), taugen also nicht
als Objektschlüssel-Annahme „slug-artig".

I18n-Scopes umfassen u. a. `Global`, `User`, `Preferences`, `Stream`,
`CLieferscheine`, `CPruefberichte` — Labels also pro Entität abrufbar.
Fallback-Kette für die Engine: `{Entity}.options.{field}` → `Global.options.{field}` → Rohwert.

## Layout- und Datensatzformat (Grundlage Phase 2)

**`detail`-Layout** — Array von Panels, jedes mit `rows`; eine Row ist ein Array
von Zellen `{ name }`. Leere Zellen erscheinen als `false` (in den vorliegenden
Fixtures nicht genutzt, aber vom Renderer abzufangen):

```jsonc
[ { "rows": [
      [ { "name": "cKundenbaustelle" }, { "name": "cLieferschein" } ],
      [ { "name": "chargeGeraet" }, { "name": "artikel" }, { "name": "emailAddress" } ]
] } ]
```

**`list`-Layout** — flaches Array von Spalten:

```jsonc
[ { "name": "name", "width": 60, "link": true, "align": "left" },
  { "name": "pruefDatum" }, { "name": "status" }, { "name": "datumNaechstePruefung" } ]
```

**Datensatz** (`fixtures/record-CPruefberichte.json`) — bestätigt für Phase 2/4:

- Links flach als `cLieferscheinId` / `cLieferscheinName`, `artikelId` / `artikelName`,
  `assignedUserId` / `assignedUserName` ✅ (A7)
- `linkMultiple` als `teamsIds` / `teamsNames`, `followersIds` / `followersNames`
- `checklist`-Werte als **Array** (leer: `[]`)
- `image` als `signatureImgId` / `signatureImgName`
- zusätzlich: `versionNumber`, `deleted`, `isFollowed`, `streamUpdatedAt`

Das `detail`-Layout referenziert mit `emailAddress` ein Feld, das in
`entityDefs` als `notStorable` markiert ist — der Renderer darf also nicht
annehmen, dass jedes Layout-Feld beschreibbar ist.

## Datenlage (Stand 21:12 UTC)

`CPruefberichte` enthält jetzt **10.001 Datensätze** — das Mengengerüst für das
Phase-4-Akzeptanzkriterium („≥ 1.000 paginiert repliziert") steht also. Die
10.000 eingespielten Datensätze haben allerdings eine Eigenart:

```jsonc
{ "id": "9999", "name": "value1" }   // modifiedAt: null, createdAt: null, alle Fachfelder leer
```

Sie wurden direkt in die Datenbank geschrieben, nicht über Espo. Daraus folgen
drei Dinge für Phase 4:

1. **Delta-Pull sieht sie nicht.** `where[after][modifiedAt]` filtert `NULL`
   weg — nach dem Initial-Pull erscheinen sie in keinem Delta mehr. Für den
   Volumentest egal, für einen realistischen Delta-Test nicht.
2. **`orderBy=modifiedAt` ist als Paginierschlüssel nicht eindeutig.** Bei
   10.000 identischen (`NULL`) Sortierwerten ist die Reihenfolge zwischen zwei
   Requests nicht garantiert — Datensätze können über Seitengrenzen hinweg
   doppelt erscheinen oder ausfallen.
   **Entscheidung: `orderBy=modifiedAt` bleibt wie in PLAN.md** (Projektvorgabe).
   Das Risiko wird stattdessen in Phase 4 abgefedert: Upserts sind idempotent
   (Duplikate schaden nicht), und nach dem Initial-Pull wird die lokale Anzahl
   gegen `total` geprüft — weicht sie ab, wird die betroffene Seite erneut
   geholt. Ein eindeutiger Sortierschlüssel (`id`) bliebe die robustere
   Variante, falls die Abweichung in der Praxis auftritt.
3. **Der Volumentest bleibt gültig**, die Renderer-Tests brauchen aber weiter
   den einen echten Datensatz (id `1`) — die Seed-Datensätze haben außer `name`
   keine Feldwerte.

**Optional, wenn ein realistischer Delta-Test gewünscht ist:** einmalig
`modified_at`/`created_at` der Seed-Zeilen in der DB auf einen Zeitstempel
setzen. Dann greifen Delta-Filter und Sortierung wie in Produktion. Ohne diesen
Schritt ist Phase 4 trotzdem umsetzbar — der Delta-Pfad wird dann über den
echten Datensatz demonstriert.

## Erledigt in Phase 0

- ✅ Entitäten-Scope: `CPruefberichte` + `CEmayrQrs` (ersetzt „Eingangsrechnung")
- ✅ A3–A11 beantwortet, alle mit Beispielen aus echten Antworten
- ✅ JSON-Fixtures im Repo, Schwärzung geprüft (I18n-Labels bleiben lesbar,
  Token und echte Adressen sind maskiert)
- ✅ CORS-Strategie entschieden und dokumentiert

### Konsequenzen für die Folgephasen

- **Phase 2:** Registry um `checklist` erweitern; `image` und `barcode` über den
  Fallback; `currency` streichen. Labels aus `{Entity}.fields`, Optionen aus
  `{Entity}.options`.
- **Phase 3:** Evaluator liest `logicDefs` (nicht nur `clientDefs.dynamicLogic`)
  und muss `and, or, equals, has, in, isEmpty, isNotEmpty, isTrue, isFalse`
  beherrschen — `has` auf Array-Werten.
- **Phase 4:** Initial-Pull `orderBy=modifiedAt&order=asc` mit `maxSize=500`,
  idempotente Upserts und Abgleich der lokalen Anzahl gegen `total`
  (siehe „Datenlage").
- **Phase 5:** `versionNumber` kommt mit dem Datensatz und wandert als
  `baseVersionNumber` in die Outbox; beim Push geht sie als Header
  `X-Version-Number` raus (**nicht** im Payload — sonst keine Konfliktprüfung).
  Konflikte sind nur bei echten Wertänderungen zu erwarten (Server vergleicht
  feldbezogen).
