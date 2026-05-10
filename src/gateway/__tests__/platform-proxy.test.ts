// @vitest-environment node
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { handlePlatformApiProxy } from "../../../bin/platform-proxy.js";

const servers: Server[] = [];

function listen(server: Server): Promise<number> {
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
  });
}

afterEach(async () => {
  delete process.env.OPENCLAW_PLATFORM_BASE_URL;
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

async function startProxyServer(): Promise<string> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    await handlePlatformApiProxy(req, res, url.pathname, url.search);
  });
  const port = await listen(server);
  return `http://127.0.0.1:${port}`;
}

describe("platform proxy", () => {
  it("forwards same-origin API requests to the node-local Platform Service", async () => {
    let upstreamPath = "";
    const platform = createServer((req, res) => {
      upstreamPath = req.url || "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    const platformPort = await listen(platform);
    process.env.OPENCLAW_PLATFORM_BASE_URL = `http://127.0.0.1:${platformPort}`;

    const proxyBase = await startProxyServer();
    const response = await fetch(`${proxyBase}/api/platform/api/health?source=test`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(upstreamPath).toBe("/api/health?source=test");
  });

  it("rejects cross-origin browser requests", async () => {
    const proxyBase = await startProxyServer();
    const response = await fetch(`${proxyBase}/api/platform/api/tunnels/discover-register`, {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Cross-origin platform request rejected",
    });
  });
});
