# Espo Offline PWA — Prototyp

Metadata-getriebene Rendering-Engine + Offline-Cache + Outbox-Sync für EspoCRM 10.x.
Vollständiger Plan: [PLAN.md](PLAN.md).

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

**Stand:** Ein erster Lauf gegen `http://emayr.local` ist erfolgt, die Befunde
stehen in `docs/API-NOTES.md`. Wesentliche Abweichungen von PLAN.md: es gibt
keine Eingangsrechnungs-Entität (Scope-Anpassung nötig), Optimistic Concurrency
ist nicht aktiv, und CORS ist wie erwartet blockiert (→ Vite-Proxy).
