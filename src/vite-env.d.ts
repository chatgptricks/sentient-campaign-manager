/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_E2E_SKIP_GOOGLE_SHEET_SYNC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
