import { useState, type FormEvent } from 'react';
import { useApp } from '../store';
import { loginWithPassword } from '../api/espoClient';
import type { AppConfig } from '../db/repo';

const DEFAULT_SCOPE = (import.meta.env.VITE_SCOPE_ENTITIES ?? 'CPruefberichte,CEmayrQrs')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Einrichtungsbildschirm. Die Instanz-URL wird bewusst nicht abgefragt:
 * die App spricht immer den relativen Pfad /api/v1 an (CORS, A10) — im
 * Dev-Betrieb leitet der Vite-Proxy dorthin weiter.
 */
export function SetupPage() {
  const connect = useApp((s) => s.connect);
  const error = useApp((s) => s.error);
  const status = useApp((s) => s.status);

  const [mode, setMode] = useState<'apiKey' | 'password'>('apiKey');
  const [apiKey, setApiKey] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [scope, setScope] = useState(DEFAULT_SCOPE.join(', '));
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = status === 'booting';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const scopeEntities = scope.split(',').map((s) => s.trim()).filter(Boolean);

    try {
      let config: AppConfig;
      if (mode === 'apiKey') {
        config = { auth: { mode: 'apiKey', apiKey: apiKey.trim() }, scopeEntities };
      } else {
        // Passwort gegen ein Token tauschen — das Passwort wird nicht gespeichert.
        const { token } = await loginWithPassword(userName.trim(), password);
        config = { auth: { mode: 'token', userName: userName.trim(), token }, scopeEntities };
      }
      await connect(config);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="setup">
      <h1>Espo Offline PWA</h1>
      <p className="muted">
        Zugang zur EspoCRM-Instanz einrichten. Die Verbindung läuft über den
        relativen Pfad <code>/api/v1</code>.
      </p>

      <form onSubmit={onSubmit}>
        <fieldset>
          <legend>Anmeldung</legend>
          <label className="radio">
            <input
              type="radio"
              checked={mode === 'apiKey'}
              onChange={() => setMode('apiKey')}
            />
            API-Key (API-User)
          </label>
          <label className="radio">
            <input
              type="radio"
              checked={mode === 'password'}
              onChange={() => setMode('password')}
            />
            Nutzer + Passwort
          </label>

          {mode === 'apiKey' ? (
            <label>
              API-Key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
          ) : (
            <>
              <label>
                Benutzername
                <input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Passwort
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            </>
          )}
        </fieldset>

        <label>
          Entitäten (kommagetrennt)
          <input value={scope} onChange={(e) => setScope(e.target.value)} required />
        </label>

        <button type="submit" disabled={busy}>
          {busy ? 'Lade Metadaten …' : 'Verbinden und Daten laden'}
        </button>
      </form>

      {(localError ?? error) && <p className="error">{localError ?? error}</p>}

      <p className="hint">
        Hinweis: Zugangsdaten werden für diesen Prototyp unverschlüsselt in
        IndexedDB abgelegt.
      </p>
    </main>
  );
}
