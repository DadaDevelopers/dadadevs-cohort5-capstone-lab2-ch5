/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to `"true"` to enable the experimental in-browser signer (Regtest only). */
  readonly VITE_ENABLE_BROWSER_SIGNER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
