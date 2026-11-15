/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base da API. Vazio (padrão) = mesmo origin, via proxy do Vite em desenvolvimento. */
  readonly VITE_API_URL?: string;
  /** Grupos mockados: `planned` (padrão em dev), `all`, `none` ou lista (`projects,tasks`). */
  readonly VITE_MOCKS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
