/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ESPOCRM_URL?: string;
  readonly VITE_SCOPE_ENTITIES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
