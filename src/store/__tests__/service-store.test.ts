import { describe, it, expect, beforeEach, vi } from "vitest";
import { useServiceStore } from "../console-stores/service-store";

vi.mock("@/gateway/platform-client", () => ({
  checkAvailable: vi.fn().mockResolvedValue(true),
  getServiceStatus: vi.fn().mockResolvedValue({
    ok: true,
    data: {
      service: { loaded: true, runtime: { status: "running", pid: 12345 } },
      gateway: { port: 18789 },
    },
  }),
  startService: vi.fn().mockResolvedValue({ ok: true, action: "start", stdout: "started" }),
  stopService: vi.fn().mockResolvedValue({ ok: true, action: "stop", stdout: "stopped" }),
  restartService: vi.fn().mockResolvedValue({ ok: true, action: "restart", stdout: "restarted" }),
  installService: vi.fn().mockResolvedValue({ ok: true, action: "install", stdout: "installed" }),
  uninstallService: vi.fn().mockResolvedValue({ ok: true, action: "uninstall", stdout: "uninstalled" }),
  setupConfig: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("ServiceStore", () => {
  beforeEach(() => {
    useServiceStore.setState({
      serviceStatus: null,
      platformAvailable: false,
      loading: {
        fetchStatus: false,
        start: false,
        stop: false,
        restart: false,
        install: false,
        uninstall: false,
      },
      error: null,
      lastAction: null,
    });
  });

  it("checkPlatform sets platformAvailable to true", async () => {
    await useServiceStore.getState().checkPlatform();
    expect(useServiceStore.getState().platformAvailable).toBe(true);
  });

  it("fetchStatus loads service status data", async () => {
    await useServiceStore.getState().fetchStatus();
    const state = useServiceStore.getState();
    expect(state.serviceStatus).toBeTruthy();
    expect(state.serviceStatus?.running).toBe(true);
    expect(state.serviceStatus?.installed).toBe(true);
    expect(state.serviceStatus?.pid).toBe(12345);
    expect(state.error).toBeNull();
  });

  it("startService succeeds and refreshes status", async () => {
    const ok = await useServiceStore.getState().startService();
    expect(ok).toBe(true);
    const state = useServiceStore.getState();
    expect(state.lastAction?.action).toBe("start");
    expect(state.lastAction?.ok).toBe(true);
  });

  it("stopService succeeds and refreshes status", async () => {
    const ok = await useServiceStore.getState().stopService();
    expect(ok).toBe(true);
    expect(useServiceStore.getState().lastAction?.action).toBe("stop");
  });

  it("installService succeeds", async () => {
    const ok = await useServiceStore.getState().installService();
    expect(ok).toBe(true);
    expect(useServiceStore.getState().lastAction?.action).toBe("install");
  });

  it("uninstallService succeeds", async () => {
    const ok = await useServiceStore.getState().uninstallService();
    expect(ok).toBe(true);
    expect(useServiceStore.getState().lastAction?.action).toBe("uninstall");
  });

  it("clearError resets error and lastAction", async () => {
    useServiceStore.setState({ error: "test error", lastAction: { action: "test", ok: false } });
    useServiceStore.getState().clearError();
    const state = useServiceStore.getState();
    expect(state.error).toBeNull();
    expect(state.lastAction).toBeNull();
  });

  it("handles platform unavailable for fetchStatus", async () => {
    const { getServiceStatus } = await import("@/gateway/platform-client");
    vi.mocked(getServiceStatus).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await useServiceStore.getState().fetchStatus();
    const state = useServiceStore.getState();
    expect(state.platformAvailable).toBe(false);
    expect(state.error).toContain("ECONNREFUSED");
  });
});
