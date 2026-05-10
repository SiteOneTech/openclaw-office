const DEFAULT_PLATFORM_API_URL = "/api/platform";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ServiceStatusData {
  installed?: boolean;
  running?: boolean;
  pid?: number;
  port?: number;
  version?: string;
  uptime?: number;
  [key: string]: unknown;
}

export interface ServiceActionResult {
  ok: boolean;
  action?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface ConfigSetupResult {
  ok: boolean;
  results?: Array<{ key: string; ok: boolean; stderr?: string }>;
}

export type TunnelStatus = "running" | "active-unmanaged" | "stopped";

export interface TunnelInfo {
  id: string;
  label: string;
  description?: string;
  kind: string;
  project?: string;
  zone?: string;
  instance?: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  url: string;
  autostart: boolean;
  tags: string[];
  source?: "configured" | "shell" | string;
  running: boolean;
  managed: boolean;
  pid?: number;
  status: TunnelStatus;
  startedAt?: string;
  logPath?: string;
}

export interface TunnelsListResult {
  ok: boolean;
  tunnels?: TunnelInfo[];
  registryPath?: string;
  error?: string;
}

export interface TunnelActionResult {
  ok: boolean;
  tunnel?: TunnelInfo;
  message?: string;
  error?: string;
}

export interface TunnelDiscoveryRegisterResult {
  ok: boolean;
  branchId?: string;
  discovered?: number;
  registered?: number;
  registryUrl?: string;
  tunnels?: TunnelInfo[];
  message?: string;
  error?: string;
}

interface RuntimePlatformConfig {
  platformApiUrl?: string;
}

function readRuntimeConfig(): RuntimePlatformConfig {
  if (typeof window === "undefined") return {};
  const injected = (window as unknown as Record<string, unknown>).__OPENCLAW_CONFIG__ as
    | RuntimePlatformConfig
    | undefined;
  return injected ?? {};
}

function resolvePlatformBaseUrl(): string {
  const runtime = readRuntimeConfig();
  const fromRuntime = (runtime.platformApiUrl ?? "").trim();
  const fromEnv = (
    (import.meta.env as unknown as Record<string, string | undefined>).VITE_PLATFORM_API_URL ?? ""
  ).trim();
  return (fromRuntime || fromEnv || DEFAULT_PLATFORM_API_URL).replace(/\/+$/u, "");
}

async function request<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${resolvePlatformBaseUrl()}${path}`, {
      method,
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    });
    const data = (await res.json()) as T;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function getServiceStatus(): Promise<{
  ok: boolean;
  data?: ServiceStatusData;
  error?: string;
  raw?: string;
}> {
  return request("/api/service/status");
}

export async function startService(): Promise<ServiceActionResult> {
  return request("/api/service/start", "POST");
}

export async function stopService(): Promise<ServiceActionResult> {
  return request("/api/service/stop", "POST");
}

export async function restartService(): Promise<ServiceActionResult> {
  return request("/api/service/restart", "POST");
}

export async function installService(): Promise<ServiceActionResult> {
  return request("/api/service/install", "POST");
}

export async function uninstallService(): Promise<ServiceActionResult> {
  return request("/api/service/uninstall", "POST");
}

export async function setupConfig(): Promise<ConfigSetupResult> {
  return request("/api/config/setup", "POST");
}

export async function listTunnels(): Promise<TunnelsListResult> {
  return request("/api/tunnels", "GET");
}

export async function startTunnel(id: string): Promise<TunnelActionResult> {
  return request(`/api/tunnels/${encodeURIComponent(id)}/start`, "POST", 45_000);
}

export async function stopTunnel(id: string): Promise<TunnelActionResult> {
  return request(`/api/tunnels/${encodeURIComponent(id)}/stop`, "POST", 20_000);
}

export async function restartTunnel(id: string): Promise<TunnelActionResult> {
  return request(`/api/tunnels/${encodeURIComponent(id)}/restart`, "POST", 50_000);
}

export async function discoverAndRegisterTunnels(): Promise<TunnelDiscoveryRegisterResult> {
  return request("/api/tunnels/discover-register", "POST", 60_000);
}

export async function checkAvailable(): Promise<boolean> {
  try {
    const res = await request<{ ok: boolean }>("/api/health", "GET", 3000);
    return res.ok === true;
  } catch {
    return false;
  }
}
