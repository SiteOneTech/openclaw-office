#!/usr/bin/env node

// Platform Service — lightweight local HTTP server for managing OpenClaw Gateway lifecycle.
// Zero external dependencies; uses only Node.js built-in modules.
// Binds exclusively to 127.0.0.1:18790 for security.

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { handleTunnelRoute, reconcileAutostartTunnels } from "./platform-tunnels.js";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HOST = "127.0.0.1";
const PORT = parseInt(process.env.PLATFORM_PORT || "18790", 10);
const COMMAND_TIMEOUT_MS = 30_000;

function findOpenclawBin() {
  const explicit = process.env.OPENCLAW_BIN;
  if (explicit) return explicit;
  return "openclaw";
}

const OPENCLAW_BIN = findOpenclawBin();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, corsHeaders());
  res.end(body);
}

function isLocalRequest(req) {
  const remote = req.socket.remoteAddress;
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

async function runCommand(args, timeoutMs = COMMAND_TIMEOUT_MS) {
  try {
    const { stdout, stderr } = await execFileAsync(OPENCLAW_BIN, args, {
      timeout: timeoutMs,
      env: { ...process.env },
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.trim() ?? "",
      stderr: err.stderr?.trim() ?? "",
      message: err.message,
      code: err.code,
    };
  }
}

async function handleServiceStatus() {
  const result = await runCommand(["gateway", "status", "--json"]);
  if (result.ok) {
    try {
      const data = JSON.parse(result.stdout);
      return { ok: true, data };
    } catch {
      return { ok: true, data: { raw: result.stdout } };
    }
  }
  // gateway status may return non-zero when not running — still valid info
  try {
    const data = JSON.parse(result.stdout || result.stderr);
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: result.stderr || result.message || "Failed to get status",
      raw: result.stdout,
    };
  }
}

async function handleServiceAction(action) {
  const result = await runCommand(["gateway", action]);
  return {
    ok: result.ok,
    action,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.ok ? {} : { error: result.message }),
  };
}

async function handleConfigSetup() {
  const results = [];
  for (const [key, value] of [
    ["gateway.controlUi.dangerouslyDisableDeviceAuth", "true"],
    ["gateway.controlUi.allowInsecureAuth", "true"],
  ]) {
    const r = await runCommand(["config", "set", key, value]);
    results.push({ key, ok: r.ok, stderr: r.stderr });
  }
  const allOk = results.every((r) => r.ok);
  return { ok: allOk, results };
}

const routes = new Map([
  ["GET /api/service/status", handleServiceStatus],
  ["POST /api/service/start", () => handleServiceAction("start")],
  ["POST /api/service/stop", () => handleServiceAction("stop")],
  ["POST /api/service/restart", () => handleServiceAction("restart")],
  ["POST /api/service/install", () => handleServiceAction("install")],
  ["POST /api/service/uninstall", () => handleServiceAction("uninstall")],
  ["POST /api/config/setup", handleConfigSetup],
]);

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Security: only accept local requests
  if (!isLocalRequest(req)) {
    sendJson(res, 403, { error: "Forbidden: only local connections allowed" });
    return;
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const routeKey = `${req.method} ${url.pathname}`;

  // Health check
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "platform", pid: process.pid });
    return;
  }

  try {
    if (await handleTunnelRoute(req, res, url, sendJson)) {
      return;
    }
  } catch (err) {
    const statusCode = Number(err.statusCode) || 500;
    sendJson(res, statusCode, { ok: false, error: String(err.message || err) });
    return;
  }

  const handler = routes.get(routeKey);
  if (!handler) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const result = await handler();
    sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) {
    sendJson(res, 500, { error: String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[platform] listening on http://${HOST}:${PORT}`);
  console.log(`[platform] openclaw bin: ${OPENCLAW_BIN}`);
  setTimeout(() => {
    reconcileAutostartTunnels("startup").catch((err) => {
      console.warn(`[platform] tunnel autostart failed: ${err.message}`);
    });
  }, 1000);
  setInterval(() => {
    reconcileAutostartTunnels("interval").catch((err) => {
      console.warn(`[platform] tunnel reconcile failed: ${err.message}`);
    });
  }, 60_000);
});
