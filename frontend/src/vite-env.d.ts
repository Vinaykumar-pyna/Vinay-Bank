/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_API_DOCS_URL?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_SHOW_DEMO_ACCOUNTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
