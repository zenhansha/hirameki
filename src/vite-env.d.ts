/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TARGET?: string;
  readonly VITE_SHARE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
