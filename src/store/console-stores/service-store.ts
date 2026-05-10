import { create } from "zustand";
import * as platformClient from "@/gateway/platform-client";
import type { ServiceStatusData } from "@/gateway/platform-client";

type OperationName =
  | "fetchStatus"
  | "start"
  | "stop"
  | "restart"
  | "install"
  | "uninstall";

interface ServiceStoreState {
  serviceStatus: ServiceStatusData | null;
  platformAvailable: boolean;
  loading: Record<OperationName, boolean>;
  error: string | null;
  lastAction: { action: string; ok: boolean; message?: string } | null;

  checkPlatform: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  startService: () => Promise<boolean>;
  stopService: () => Promise<boolean>;
  restartService: () => Promise<boolean>;
  installService: () => Promise<boolean>;
  uninstallService: () => Promise<boolean>;
  autoStartGateway: () => Promise<boolean>;
  clearError: () => void;
}

function makeLoading(): Record<OperationName, boolean> {
  return {
    fetchStatus: false,
    start: false,
    stop: false,
    restart: false,
    install: false,
    uninstall: false,
  };
}

export const useServiceStore = create<ServiceStoreState>((set, get) => ({
  serviceStatus: null,
  platformAvailable: false,
  loading: makeLoading(),
  error: null,
  lastAction: null,

  clearError: () => set({ error: null, lastAction: null }),

  checkPlatform: async () => {
    const available = await platformClient.checkAvailable();
    set({ platformAvailable: available });
  },

  fetchStatus: async () => {
    set((s) => ({ loading: { ...s.loading, fetchStatus: true }, error: null }));
    try {
      const result = await platformClient.getServiceStatus();
      if (result.ok && result.data) {
        const raw = result.data as Record<string, unknown>;
        const service = raw.service as Record<string, unknown> | undefined;
        const runtime = service?.runtime as Record<string, unknown> | undefined;
        const gateway = raw.gateway as Record<string, unknown> | undefined;

        const normalized: ServiceStatusData = {
          installed: service?.loaded === true,
          running: runtime?.status === "running",
          pid: typeof runtime?.pid === "number" ? runtime.pid : undefined,
          port: typeof gateway?.port === "number" ? gateway.port : undefined,
        };
        set((s) => ({
          loading: { ...s.loading, fetchStatus: false },
          serviceStatus: normalized,
          error: null,
          platformAvailable: true,
        }));
      } else {
        set((s) => ({
          loading: { ...s.loading, fetchStatus: false },
          serviceStatus: null,
          error: result.ok ? null : (result.error ?? "Failed to fetch status"),
          platformAvailable: true,
        }));
      }
    } catch (err) {
      set((s) => ({
        loading: { ...s.loading, fetchStatus: false },
        error: String(err),
        platformAvailable: false,
      }));
    }
  },

  startService: async () => {
    set((s) => ({ loading: { ...s.loading, start: true }, error: null }));
    try {
      const result = await platformClient.startService();
      set((s) => ({
        loading: { ...s.loading, start: false },
        lastAction: { action: "start", ok: result.ok, message: result.stderr || result.stdout },
        error: result.ok ? null : (result.error ?? result.stderr ?? "Start failed"),
      }));
      if (result.ok) await get().fetchStatus();
      return result.ok;
    } catch (err) {
      set((s) => ({ loading: { ...s.loading, start: false }, error: String(err) }));
      return false;
    }
  },

  stopService: async () => {
    set((s) => ({ loading: { ...s.loading, stop: true }, error: null }));
    try {
      const result = await platformClient.stopService();
      set((s) => ({
        loading: { ...s.loading, stop: false },
        lastAction: { action: "stop", ok: result.ok, message: result.stderr || result.stdout },
        error: result.ok ? null : (result.error ?? "Stop failed"),
      }));
      if (result.ok) await get().fetchStatus();
      return result.ok;
    } catch (err) {
      set((s) => ({ loading: { ...s.loading, stop: false }, error: String(err) }));
      return false;
    }
  },

  restartService: async () => {
    set((s) => ({ loading: { ...s.loading, restart: true }, error: null }));
    try {
      const result = await platformClient.restartService();
      set((s) => ({
        loading: { ...s.loading, restart: false },
        lastAction: { action: "restart", ok: result.ok, message: result.stderr || result.stdout },
        error: result.ok ? null : (result.error ?? "Restart failed"),
      }));
      if (result.ok) {
        // Wait briefly for the service to come back up
        await new Promise((r) => setTimeout(r, 3000));
        await get().fetchStatus();
      }
      return result.ok;
    } catch (err) {
      set((s) => ({ loading: { ...s.loading, restart: false }, error: String(err) }));
      return false;
    }
  },

  installService: async () => {
    set((s) => ({ loading: { ...s.loading, install: true }, error: null }));
    try {
      const result = await platformClient.installService();
      set((s) => ({
        loading: { ...s.loading, install: false },
        lastAction: { action: "install", ok: result.ok, message: result.stderr || result.stdout },
        error: result.ok ? null : (result.error ?? "Install failed"),
      }));
      if (result.ok) await get().fetchStatus();
      return result.ok;
    } catch (err) {
      set((s) => ({ loading: { ...s.loading, install: false }, error: String(err) }));
      return false;
    }
  },

  uninstallService: async () => {
    set((s) => ({ loading: { ...s.loading, uninstall: true }, error: null }));
    try {
      const result = await platformClient.uninstallService();
      set((s) => ({
        loading: { ...s.loading, uninstall: false },
        lastAction: { action: "uninstall", ok: result.ok, message: result.stderr || result.stdout },
        error: result.ok ? null : (result.error ?? "Uninstall failed"),
      }));
      if (result.ok) await get().fetchStatus();
      return result.ok;
    } catch (err) {
      set((s) => ({ loading: { ...s.loading, uninstall: false }, error: String(err) }));
      return false;
    }
  },

  autoStartGateway: async () => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 3000;

    const { platformAvailable } = get();
    if (!platformAvailable) {
      await get().checkPlatform();
      if (!get().platformAvailable) return false;
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const started = await get().startService();
      if (started) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return true;
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
    return false;
  },
}));
