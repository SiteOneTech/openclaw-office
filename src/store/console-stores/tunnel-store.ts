import { create } from "zustand";
import * as platformClient from "@/gateway/platform-client";
import type { TunnelInfo } from "@/gateway/platform-client";

type TunnelAction = "fetch" | "start" | "stop" | "restart" | "discover-register";

interface TunnelStoreState {
  tunnels: TunnelInfo[];
  registryPath: string;
  platformAvailable: boolean;
  loading: boolean;
  error: string | null;
  actionInFlight: Record<string, TunnelAction>;
  lastAction: { id: string; action: TunnelAction; ok: boolean; message?: string } | null;

  fetchTunnels: () => Promise<void>;
  startTunnel: (id: string) => Promise<boolean>;
  stopTunnel: (id: string) => Promise<boolean>;
  restartTunnel: (id: string) => Promise<boolean>;
  discoverAndRegisterTunnels: () => Promise<boolean>;
  clearError: () => void;
}

function messageFrom(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "Unknown error";
  }
}

async function runTunnelAction(
  id: string,
  action: Exclude<TunnelAction, "fetch">,
): Promise<platformClient.TunnelActionResult> {
  if (action === "start") return platformClient.startTunnel(id);
  if (action === "stop") return platformClient.stopTunnel(id);
  return platformClient.restartTunnel(id);
}

export const useTunnelStore = create<TunnelStoreState>((set, get) => ({
  tunnels: [],
  registryPath: "",
  platformAvailable: false,
  loading: false,
  error: null,
  actionInFlight: {},
  lastAction: null,

  clearError: () => set({ error: null, lastAction: null }),

  fetchTunnels: async () => {
    set({ loading: true, error: null });
    try {
      const result = await platformClient.listTunnels();
      set({
        loading: false,
        platformAvailable: result.ok,
        tunnels: Array.isArray(result.tunnels) ? result.tunnels : [],
        registryPath: result.registryPath ?? "",
        error: result.ok ? null : (result.error ?? "Failed to load tunnels"),
      });
    } catch (err) {
      set({
        loading: false,
        platformAvailable: false,
        tunnels: [],
        error: messageFrom(err),
      });
    }
  },

  startTunnel: (id) => runAndRefresh(id, "start", set, get),
  stopTunnel: (id) => runAndRefresh(id, "stop", set, get),
  restartTunnel: (id) => runAndRefresh(id, "restart", set, get),

  discoverAndRegisterTunnels: async () => {
    set({ loading: true, error: null });
    try {
      const result = await platformClient.discoverAndRegisterTunnels();
      set({
        loading: false,
        platformAvailable: result.ok,
        tunnels: Array.isArray(result.tunnels) ? result.tunnels : get().tunnels,
        lastAction: {
          id: result.branchId ?? "local",
          action: "discover-register",
          ok: result.ok,
          message: result.message ?? `registered ${result.registered ?? 0} of ${result.discovered ?? 0} discovered tunnels`,
        },
        error: result.ok ? null : (result.error ?? "discover/register failed"),
      });
      if (result.ok) {
        await get().fetchTunnels();
      }
      return result.ok;
    } catch (err) {
      set({ loading: false, platformAvailable: false, error: messageFrom(err) });
      return false;
    }
  },
}));

async function runAndRefresh(
  id: string,
  action: Exclude<TunnelAction, "fetch">,
  set: (partial: Partial<TunnelStoreState> | ((state: TunnelStoreState) => Partial<TunnelStoreState>)) => void,
  get: () => TunnelStoreState,
): Promise<boolean> {
  set((state) => ({ actionInFlight: { ...state.actionInFlight, [id]: action }, error: null }));
  try {
    const result = await runTunnelAction(id, action);
    set((state) => ({
      lastAction: { id, action, ok: result.ok, message: result.message ?? result.error },
      error: result.ok ? null : (result.error ?? `${action} failed`),
      tunnels: result.tunnel
        ? state.tunnels.map((item) => (item.id === id ? result.tunnel as TunnelInfo : item))
        : state.tunnels,
    }));
    await get().fetchTunnels();
    return result.ok;
  } catch (err) {
    set({ error: messageFrom(err) });
    return false;
  } finally {
    set((state) => {
      const next = { ...state.actionInFlight };
      delete next[id];
      return { actionInFlight: next };
    });
  }
}
