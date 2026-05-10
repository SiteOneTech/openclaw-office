// Tunnel management for the local Platform Service.
// Keeps private service tunnels local to the node while the React UI stays generic.

import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverShellTunnels } from "./platform-tunnel-discovery.js";

const STATE_DIR = join(homedir(), ".openclaw-office");
const TUNNELS_FILE = process.env.OPENCLAW_TUNNELS_FILE || join(STATE_DIR, "tunnels.json");
const TUNNEL_STATE_FILE = join(STATE_DIR, "tunnel-state.json");
const TUNNEL_LOG_DIR = join(STATE_DIR, "tunnels");

async function ensureStateDirs() {
  await mkdir(STATE_DIR, { recursive: true });
  await mkdir(TUNNEL_LOG_DIR, { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, data) {
  await ensureStateDirs();
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function normalizeTunnel(raw) {
  const id = String(raw?.id || "").trim();
  const localPort = Number(raw?.localPort);
  const remotePort = Number(raw?.remotePort);
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) return null;
  if (!Number.isInteger(localPort) || localPort <= 0 || localPort > 65535) return null;
  if (!Number.isInteger(remotePort) || remotePort <= 0 || remotePort > 65535) return null;

  return {
    ...raw,
    id,
    label: String(raw?.label || id).trim(),
    description: String(raw?.description || "").trim(),
    kind: String(raw?.kind || "gcp-iap").trim(),
    localHost: String(raw?.localHost || "127.0.0.1").trim(),
    localPort,
    remoteHost: String(raw?.remoteHost || "127.0.0.1").trim(),
    remotePort,
    url: String(raw?.url || `http://127.0.0.1:${localPort}`).trim(),
    autostart: raw?.autostart === true,
    tags: Array.isArray(raw?.tags) ? raw.tags.map((t) => String(t)).filter(Boolean) : [],
  };
}

async function readTunnelRegistry() {
  await ensureStateDirs();
  const existing = await readJsonFile(TUNNELS_FILE, null);
  const rawTunnels = Array.isArray(existing?.tunnels) ? existing.tunnels : [];
  const byId = new Map();
  for (const tunnel of rawTunnels) {
    const normalized = normalizeTunnel(tunnel);
    if (normalized) byId.set(normalized.id, normalized);
  }
  const tunnels = [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  const next = { version: 1, tunnels };
  if (!existing || JSON.stringify(existing.tunnels ?? []) !== JSON.stringify(tunnels)) {
    await writeJsonFile(TUNNELS_FILE, next);
  }
  return next;
}

async function readTunnelState() {
  const state = await readJsonFile(TUNNEL_STATE_FILE, {});
  return state && typeof state === "object" ? state : {};
}

async function writeTunnelState(state) {
  await writeJsonFile(TUNNEL_STATE_FILE, state);
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isPortOpen(host, port, timeoutMs = 450) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function publicTunnel(tunnel, status) {
  return {
    id: tunnel.id,
    label: tunnel.label,
    description: tunnel.description,
    kind: tunnel.kind,
    project: tunnel.project,
    zone: tunnel.zone,
    instance: tunnel.instance,
    localHost: tunnel.localHost,
    localPort: tunnel.localPort,
    remoteHost: tunnel.remoteHost,
    remotePort: tunnel.remotePort,
    url: tunnel.url,
    autostart: tunnel.autostart,
    tags: tunnel.tags,
    source: tunnel.source || "configured",
    ...status,
  };
}

function resolveBranchId() {
  return String(
    process.env.OPENCLAW_BRANCH_ID ||
      process.env.OPENCLAW_BRANCH ||
      process.env.KASPAR_REGISTRY_SOURCE ||
      "",
  ).trim();
}

function resolveRegistryBaseUrl() {
  return String(process.env.KASPAR_REGISTRY_BASE_URL || "http://openclaw-hq:8781")
    .trim()
    .replace(/\/+$/u, "");
}

function tunnelTarget(tunnel) {
  if (tunnel.kind === "gcp-iap") {
    return {
      project: tunnel.project,
      zone: tunnel.zone,
      instance: tunnel.instance,
      remote_host: tunnel.remoteHost,
      remote_port: tunnel.remotePort,
    };
  }
  if (tunnel.kind === "command") {
    return {
      command: tunnel.command,
      args: Array.isArray(tunnel.args) ? tunnel.args.map((arg) => String(arg)) : [],
    };
  }
  return {
    remote_host: tunnel.remoteHost,
    remote_port: tunnel.remotePort,
  };
}

function toRegistryTunnel(tunnel, status) {
  return {
    tunnel_id: tunnel.id,
    label: tunnel.label,
    kind: tunnel.kind,
    local_url: tunnel.url,
    target: tunnelTarget(tunnel),
    autostart: tunnel.autostart,
    status: status.status,
    metadata: {
      tags: tunnel.tags,
      running: status.running,
      managed: status.managed,
      local_host: tunnel.localHost,
      local_port: tunnel.localPort,
      log_path: status.logPath,
    },
  };
}

async function postRegistryTunnels(branchId, registryTunnels) {
  const baseUrl = resolveRegistryBaseUrl();
  const token = String(process.env.KASPAR_REGISTRY_API_TOKEN || "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${baseUrl}/v1/branches/${encodeURIComponent(branchId)}/tunnels/upsert`, {
      method: "POST",
      headers,
      body: JSON.stringify({ source: "openclaw-office-platform", tunnels: registryTunnels }),
      signal: controller.signal,
    });
    const text = await res.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { detail: text };
      }
    }
    if (!res.ok) {
      const detail = body.detail || body.error || `registry HTTP ${res.status}`;
      throw new Error(String(detail));
    }
    return { baseUrl, body };
  } finally {
    clearTimeout(timer);
  }
}

async function getTunnelStatus(tunnel, state) {
  const record = state[tunnel.id] || {};
  const pid = Number(record.pid);
  const managed = isPidAlive(pid);
  const running = await isPortOpen(tunnel.localHost, tunnel.localPort);
  return {
    running,
    managed,
    pid: managed ? pid : undefined,
    status: running ? (managed ? "running" : "active-unmanaged") : "stopped",
    startedAt: managed ? record.startedAt : undefined,
    logPath: record.logPath || join(TUNNEL_LOG_DIR, `${tunnel.id}.log`),
  };
}

async function listLocalTunnelInventory() {
  const registry = await readTunnelRegistry();
  const state = await readTunnelState();
  const tunnels = [];
  const configuredPorts = new Set();
  for (const tunnel of registry.tunnels) {
    configuredPorts.add(`${tunnel.localHost}:${tunnel.localPort}`);
    tunnels.push(publicTunnel(tunnel, await getTunnelStatus(tunnel, state)));
  }

  for (const tunnel of await discoverShellTunnels()) {
    const localKey = `${tunnel.localHost}:${tunnel.localPort}`;
    if (configuredPorts.has(localKey)) {
      continue;
    }
    tunnels.push(publicTunnel(tunnel, {
      running: true,
      managed: false,
      pid: tunnel.pid,
      status: "active-unmanaged",
      startedAt: undefined,
      logPath: undefined,
    }));
  }

  return tunnels.sort((a, b) => a.label.localeCompare(b.label));
}

function buildTunnelCommand(tunnel) {
  if (tunnel.kind === "command") {
    const command = String(tunnel.command || "").trim();
    if (!command) throw new Error("command tunnel requires command");
    const args = Array.isArray(tunnel.args) ? tunnel.args.map((arg) => String(arg)) : [];
    return { command, args };
  }

  if (tunnel.kind !== "gcp-iap") {
    throw new Error(`unsupported tunnel kind: ${tunnel.kind}`);
  }
  for (const key of ["project", "zone", "instance"]) {
    if (!String(tunnel[key] || "").trim()) {
      throw new Error(`gcp-iap tunnel requires ${key}`);
    }
  }
  const gcloudBin = process.env.GCLOUD_BIN || "gcloud";
  return {
    command: gcloudBin,
    args: [
      "compute",
      "ssh",
      tunnel.instance,
      "--project",
      tunnel.project,
      "--zone",
      tunnel.zone,
      "--tunnel-through-iap",
      "--",
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=3",
      "-L",
      `${tunnel.localHost}:${tunnel.localPort}:${tunnel.remoteHost}:${tunnel.remotePort}`,
    ],
  };
}

async function findTunnel(id) {
  const registry = await readTunnelRegistry();
  const tunnel = registry.tunnels.find((item) => item.id === id);
  if (!tunnel) throw Object.assign(new Error(`Tunnel not found: ${id}`), { statusCode: 404 });
  return tunnel;
}

async function handleTunnelsList() {
  return { ok: true, tunnels: await listLocalTunnelInventory(), registryPath: TUNNELS_FILE };
}

async function handleTunnelDiscoverRegister() {
  const branchId = resolveBranchId();
  if (!branchId) {
    return {
      ok: false,
      discovered: 0,
      registered: 0,
      error: "OPENCLAW_BRANCH_ID, OPENCLAW_BRANCH, or KASPAR_REGISTRY_SOURCE is required",
    };
  }
  const tunnels = await listLocalTunnelInventory();
  const registryTunnels = tunnels.map((tunnel) => toRegistryTunnel(tunnel, tunnel));
  const published = await postRegistryTunnels(branchId, registryTunnels);
  const registered = Number(published.body?.tunnel_count ?? registryTunnels.length);
  return {
    ok: true,
    branchId,
    discovered: registryTunnels.length,
    registered,
    registryUrl: published.baseUrl,
    tunnels,
    message: `registered ${registered} of ${registryTunnels.length} discovered tunnels`,
  };
}

async function handleTunnelStart(id) {
  await ensureStateDirs();
  const tunnel = await findTunnel(id);
  const state = await readTunnelState();
  const before = await getTunnelStatus(tunnel, state);
  if (before.running) {
    return { ok: true, tunnel: publicTunnel(tunnel, before), message: "already running" };
  }

  const { command, args } = buildTunnelCommand(tunnel);
  const logPath = join(TUNNEL_LOG_DIR, `${tunnel.id}.log`);
  const outFd = openSync(logPath, "a");
  const errFd = openSync(logPath, "a");
  let child;
  try {
    child = spawn(command, args, {
      detached: true,
      stdio: ["ignore", outFd, errFd],
      env: { ...process.env },
    });
  } finally {
    closeSync(outFd);
    closeSync(errFd);
  }
  child.unref();

  state[tunnel.id] = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    logPath,
  };
  await writeTunnelState(state);
  let status = await getTunnelStatus(tunnel, state);
  const deadline = Date.now() + 12_000;
  while (!status.running && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 750));
    status = await getTunnelStatus(tunnel, state);
  }
  return {
    ok: status.running,
    tunnel: publicTunnel(tunnel, status),
    message: status.running ? "started" : "process started but local port is not open yet",
  };
}

async function handleTunnelStop(id) {
  const tunnel = await findTunnel(id);
  const state = await readTunnelState();
  const status = await getTunnelStatus(tunnel, state);
  if (!status.running) {
    delete state[tunnel.id];
    await writeTunnelState(state);
    return { ok: true, tunnel: publicTunnel(tunnel, status), message: "already stopped" };
  }
  if (!status.pid) {
    return {
      ok: false,
      tunnel: publicTunnel(tunnel, status),
      error: "Tunnel is active but was not started by this platform service.",
    };
  }

  try {
    process.kill(-status.pid, "SIGTERM");
  } catch {
    try {
      process.kill(status.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  await new Promise((r) => setTimeout(r, 1200));
  if (isPidAlive(status.pid)) {
    try {
      process.kill(-status.pid, "SIGKILL");
    } catch {
      try {
        process.kill(status.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
  delete state[tunnel.id];
  await writeTunnelState(state);
  const after = await getTunnelStatus(tunnel, state);
  return { ok: !after.running, tunnel: publicTunnel(tunnel, after), message: "stopped" };
}

async function handleTunnelRestart(id) {
  const stopped = await handleTunnelStop(id);
  if (!stopped.ok) {
    return stopped;
  }
  return handleTunnelStart(id);
}

let tunnelReconcileRunning = false;

export async function reconcileAutostartTunnels(reason = "manual") {
  if (tunnelReconcileRunning) return;
  tunnelReconcileRunning = true;
  try {
    await autostartTunnels(reason);
    await autoRegisterTunnels(reason);
  } finally {
    tunnelReconcileRunning = false;
  }
}

async function autostartTunnels(reason = "startup") {
  const registry = await readTunnelRegistry();
  for (const tunnel of registry.tunnels.filter((item) => item.autostart)) {
    try {
      await handleTunnelStart(tunnel.id);
    } catch (err) {
      console.warn(`[platform] tunnel autostart failed for ${tunnel.id} during ${reason}: ${err.message}`);
    }
  }
}

async function autoRegisterTunnels(reason = "startup") {
  const enabled = String(process.env.OPENCLAW_TUNNELS_AUTO_REGISTER || "1").trim().toLowerCase();
  if (!["1", "true", "yes", "on"].includes(enabled)) return;
  if (!resolveBranchId()) return;
  try {
    await handleTunnelDiscoverRegister();
  } catch (err) {
    console.warn(`[platform] tunnel registry sync failed during ${reason}: ${err.message}`);
  }
}

export async function handleTunnelRoute(req, res, url, sendJson) {
  if (req.method === "GET" && url.pathname === "/api/tunnels") {
    sendJson(res, 200, await handleTunnelsList());
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/tunnels/discover-register") {
    const result = await handleTunnelDiscoverRegister();
    sendJson(res, result.ok ? 200 : 500, result);
    return true;
  }

  const match = /^\/api\/tunnels\/([^/]+)\/(start|stop|restart)$/u.exec(url.pathname);
  if (!match || req.method !== "POST") {
    return false;
  }

  const id = decodeURIComponent(match[1]);
  const action = match[2];
  const result =
    action === "start"
      ? await handleTunnelStart(id)
      : action === "stop"
        ? await handleTunnelStop(id)
        : await handleTunnelRestart(id);
  sendJson(res, result.ok ? 200 : 500, result);
  return true;
}
