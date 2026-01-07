/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LINE_CHANNEL_ID: string
  readonly VITE_N8N_WEBHOOK_URL: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
