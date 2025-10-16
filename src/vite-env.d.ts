/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RISC0_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
