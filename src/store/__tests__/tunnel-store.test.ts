import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTunnelStore } from "../console-stores/tunnel-store";

vi.mock("@/gateway/platform-client", () => ({
  listTunnels: vi.fn().mockResolvedValue({
    ok: true,
    tunnels: [
      {
        id: "zeus-dashboard",
        label: "Zeus Dashboard",
        kind: "gcp-iap",
        localHost: "127.0.0.1",
        localPort: 9119,
        remoteHost: "127.0.0.1",
        remotePort: 9119,
        url: "http://127.0.0.1:9119",
        autostart: true,
        tags: ["zeus"],
        running: true,
        managed: true,
        status: "running",
      },
    ],
    registryPath: "/home/user/.openclaw-office/tunnels.json",
  }),
  startTunnel: vi.fn().mockResolvedValue({ ok: true }),
  stopTunnel: vi.fn().mockResolvedValue({ ok: true }),
  restartTunnel: vi.fn().mockResolvedValue({ ok: true }),
  discoverAndRegisterTunnels: vi.fn().mockResolvedValue({
    ok: true,
    discovered: 1,
    registered: 1,
    tunnels: [
      {
        id: "zeus-dashboard",
        label: "Zeus Dashboard",
        kind: "gcp-iap",
        localHost: "127.0.0.1",
        localPort: 9119,
        remoteHost: "127.0.0.1",
        remotePort: 9119,
        url: "http://127.0.0.1:9119",
        autostart: true,
        tags: ["zeus"],
        running: true,
        managed: true,
        status: "running",
      },
    ],
  }),
}));

describe("TunnelStore", () => {
  beforeEach(() => {
    useTunnelStore.setState({
      tunnels: [],
      registryPath: "",
      platformAvailable: false,
      loading: false,
      error: null,
      actionInFlight: {},
      lastAction: null,
    });
  });

  it("discovers and registers local tunnels automatically", async () => {
    const ok = await useTunnelStore.getState().discoverAndRegisterTunnels();

    const state = useTunnelStore.getState();
    expect(ok).toBe(true);
    expect(state.lastAction).toMatchObject({
      action: "discover-register",
      ok: true,
      message: "registered 1 of 1 discovered tunnels",
    });
    expect(state.tunnels).toHaveLength(1);
    expect(state.tunnels[0]?.id).toBe("zeus-dashboard");
  });
});
