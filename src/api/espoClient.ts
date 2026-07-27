/**
 * Fetch-Wrapper für die EspoCRM-REST-API.
 *
 * Verifizierte Grundlagen (docs/API-NOTES.md, Phase 0):
 * - Auth wahlweise `X-Api-Key` (API-User) oder
 *   `Espo-Authorization: Basic base64(user:token)` (regulärer Nutzer).
 * - Fehlergrund steht im Response-Header `X-Status-Reason`.
 * - Beim Schreiben reist die Version im Header `X-Version-Number`
 *   (NICHT im Payload — dort wird sie ignoriert und die Konfliktprüfung
 *   entfiele stillschweigend).
 * - Die Instanz sendet keine CORS-Header: Basis-URL ist deshalb relativ
 *   (`/api/v1`), im Dev-Betrieb übernimmt der Vite-Proxy die Weiterleitung.
 *
 * Hinweis zu A2: API-User erhalten I18n nur in der Systemsprache. Bei
 * deutscher Systemsprache ist das für den Prototyp unkritisch.
 */

export const API_BASE = '/api/v1';

export type AuthConfig =
  | { mode: 'apiKey'; apiKey: string }
  | { mode: 'token'; userName: string; token: string };

/** Fehler mit HTTP-Status und dem von Espo gelieferten Grund. */
export class EspoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    readonly url: string,
  ) {
    super(`HTTP ${status}${reason ? ` — ${reason}` : ''} (${url})`);
    this.name = 'EspoHttpError';
  }

  /** Versionskonflikt (Optimistic Concurrency, A9) — relevant ab Phase 5. */
  get isConflict() {
    return this.status === 409;
  }

  /** Server-Validierung, Formeln oder ACL — Operation ist so nicht sendbar. */
  get isRejected() {
    return this.status === 400 || this.status === 403;
  }
}

/** Netzwerkfehler (offline, DNS, Abbruch) — im Gegensatz zu HTTP-Fehlern retrybar. */
export class EspoNetworkError extends Error {
  constructor(readonly url: string, cause: unknown) {
    super(`Netzwerkfehler (${url})`);
    this.name = 'EspoNetworkError';
    this.cause = cause;
  }
}

function authHeaders(auth: AuthConfig): Record<string, string> {
  if (auth.mode === 'apiKey') return { 'X-Api-Key': auth.apiKey };
  const basic = btoa(`${auth.userName}:${auth.token}`);
  return { 'Espo-Authorization': `Basic ${basic}` };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Query-Parameter; Arrays/Objekte werden als Espo-searchParams kodiert. */
  params?: Record<string, unknown>;
  /** Optimistic Concurrency: geht als Header X-Version-Number raus. */
  versionNumber?: number;
  signal?: AbortSignal;
}

/**
 * Kodiert verschachtelte Query-Parameter im von Espo erwarteten Format,
 * z. B. where[0][type]=after&where[0][attribute]=modifiedAt (A6).
 */
function encodeParams(params: Record<string, unknown>): string {
  const out = new URLSearchParams();
  const walk = (prefix: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(`${prefix}[${k}]`, v);
    } else {
      out.append(prefix, String(value));
    }
  };
  for (const [key, value] of Object.entries(params)) walk(key, value);
  return out.toString();
}

export class EspoClient {
  constructor(
    private auth: AuthConfig,
    private baseUrl: string = API_BASE,
  ) {}

  setAuth(auth: AuthConfig) {
    this.auth = auth;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, params, versionNumber, signal } = options;
    const query = params ? `?${encodeParams(params)}` : '';
    const url = `${this.baseUrl}/${path}${query}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        signal,
        headers: {
          ...authHeaders(this.auth),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(versionNumber !== undefined
            ? { 'X-Version-Number': String(versionNumber) }
            : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new EspoNetworkError(url, err);
    }

    if (!res.ok) {
      throw new EspoHttpError(res.status, res.headers.get('X-Status-Reason') ?? '', url);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // --- Endpunkte, die der Boot-Vorgang braucht (Phase 1) ---

  /** Nutzer, ACL, Einstellungen und Sprache in einem Request (A3). */
  appUser() {
    return this.request<AppUserResponse>('App/user');
  }

  metadata() {
    return this.request<EspoMetadata>('Metadata');
  }

  i18n() {
    return this.request<I18nData>('I18n');
  }

  /** Layout-Pfad verifiziert in A4. */
  layout(entityType: string, name: LayoutName) {
    return this.request<unknown>(`${entityType}/layout/${name}`);
  }
}

/**
 * Meldet einen Nutzer mit Passwort an und gibt das Token zurück.
 * Espo liefert `token` als Teil der App/user-Antwort (belegt in
 * fixtures/app-user.json); damit sind Folge-Requests passwortfrei.
 */
export async function loginWithPassword(
  userName: string,
  password: string,
  baseUrl: string = API_BASE,
): Promise<{ token: string; appUser: AppUserResponse }> {
  const client = new EspoClient({ mode: 'token', userName, token: password }, baseUrl);
  const appUser = await client.appUser();
  const token = appUser.token;
  if (!token) {
    throw new Error('Antwort enthielt kein Token — Zugangsdaten oder Instanz prüfen.');
  }
  return { token, appUser };
}

// --- Typen (bewusst schlank; die Engine arbeitet generisch auf den Rohdaten) ---

export type LayoutName = 'detail' | 'list';

export interface AppUserResponse {
  user: { id: string; userName: string; name?: string; type?: string };
  acl?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  language?: string;
  /** Nur bei Passwort-Login vorhanden. */
  token?: string;
  [key: string]: unknown;
}

export interface FieldDef {
  type: string;
  options?: string[];
  required?: boolean;
  readOnly?: boolean;
  notStorable?: boolean;
  disabled?: boolean;
  maxLength?: number;
  [key: string]: unknown;
}

export interface EntityDef {
  fields?: Record<string, FieldDef>;
  links?: Record<string, unknown>;
  optimisticConcurrencyControl?: boolean;
  [key: string]: unknown;
}

export interface EspoMetadata {
  entityDefs?: Record<string, EntityDef>;
  clientDefs?: Record<string, { dynamicLogic?: unknown; [key: string]: unknown }>;
  /** Ab Espo 9/10 die maßgebliche Quelle der Dynamic Logic (A8). */
  logicDefs?: Record<string, unknown>;
  scopes?: Record<string, unknown>;
  [key: string]: unknown;
}

/** `{Entity}.fields.{field}` = Label, `{Entity}.options.{field}.{value}` = Optionstext. */
export type I18nData = Record<
  string,
  { fields?: Record<string, string>; options?: Record<string, Record<string, string>>; [key: string]: unknown }
>;
