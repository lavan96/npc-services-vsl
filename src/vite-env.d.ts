/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VSL_HLS_URL?: string;
  readonly VITE_VSL_POSTER_URL?: string;
  readonly VITE_VSL_FALLBACK_MP4_URL?: string;
  readonly VITE_VSL_IOS_HLS_URL?: string;
  readonly VITE_VSL_IOS_FALLBACK_MP4_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
