/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time deploy fingerprint (CI or package version); see vite.config.ts */
  readonly VITE_DEPLOY_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
