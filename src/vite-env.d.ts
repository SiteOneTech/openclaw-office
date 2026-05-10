/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

interface ImportMetaEnv {
  readonly VITE_GATEWAY_URL?: string;
  readonly VITE_GATEWAY_TOKEN?: string;
  readonly VITE_GATEWAY_WS_PATH?: string;
  readonly VITE_OFFICE_TITLE?: string;
  readonly VITE_BRANCH_LABEL?: string;
  /**
   * Browser-facing base URL for Platform Service commands. By default the
   * packaged Office server proxies `/api/platform/*` to the node-local
   * Platform Service, which keeps remote/tunneled UIs working.
   */
  readonly VITE_PLATFORM_API_URL?: string;
  /**
   * Base URL of the local HQ sidecar that exposes the registry-API surface
   * (pairing requests + notification channels + notify broadcast).
   * Defaults to `http://openclaw-hq:8781` on the Tailscale tailnet — the
   * sidecar uses `tailscale whois` for source identity, so no bearer token
   * is required (and none should ever be shipped in the browser bundle).
   */
  readonly VITE_REGISTRY_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
