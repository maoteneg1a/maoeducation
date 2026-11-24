/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_MOBILE_DEMO_INSTITUTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
