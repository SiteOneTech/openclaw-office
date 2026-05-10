import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("platform-client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function importModule() {
    return import("../platform-client");
  }

  it("checkAvailable returns true when platform responds", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true }),
    });
    const { checkAvailable } = await importModule();
    const result = await checkAvailable();
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/platform/api/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("checkAvailable returns false on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { checkAvailable } = await importModule();
    const result = await checkAvailable();
    expect(result).toBe(false);
  });

  it("getServiceStatus calls correct endpoint", async () => {
    const mockData = { ok: true, data: { running: true, pid: 123 } };
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockData),
    });
    const { getServiceStatus } = await importModule();
    const result = await getServiceStatus();
    expect(result.ok).toBe(true);
    expect(result.data?.running).toBe(true);
  });

  it("startService calls POST /api/service/start", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, action: "start" }),
    });
    const { startService } = await importModule();
    const result = await startService();
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/platform/api/service/start",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("restartService calls POST /api/service/restart", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, action: "restart" }),
    });
    const { restartService } = await importModule();
    const result = await restartService();
    expect(result.ok).toBe(true);
  });

  it("stopService calls POST /api/service/stop", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, action: "stop" }),
    });
    const { stopService } = await importModule();
    const result = await stopService();
    expect(result.ok).toBe(true);
  });

  it("installService calls POST /api/service/install", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, action: "install" }),
    });
    const { installService } = await importModule();
    const result = await installService();
    expect(result.ok).toBe(true);
  });

  it("uninstallService calls POST /api/service/uninstall", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, action: "uninstall" }),
    });
    const { uninstallService } = await importModule();
    const result = await uninstallService();
    expect(result.ok).toBe(true);
  });

  it("setupConfig calls POST /api/config/setup", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, results: [] }),
    });
    const { setupConfig } = await importModule();
    const result = await setupConfig();
    expect(result.ok).toBe(true);
  });

  it("discoverAndRegisterTunnels calls POST /api/tunnels/discover-register", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, discovered: 2, registered: 2 }),
    });
    const { discoverAndRegisterTunnels } = await importModule();
    const result = await discoverAndRegisterTunnels();
    expect(result.ok).toBe(true);
    expect(result.registered).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/platform/api/tunnels/discover-register",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
