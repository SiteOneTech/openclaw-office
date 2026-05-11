#!/usr/bin/env node

import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, access, readdir, unlink, mkdir } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces, homedir } from "node:os";
import { spawn } from "node:child_process";
import { handlePlatformApiProxy } from "./platform-proxy.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(__dirname, "..", "dist");
const DEFAULT_OFFICE_TITLE = "SitioUno Office";

// --- Service subcommand routing ---
// If argv[2] is "service", delegate to the service manager module.
if (process.argv[2] === "service") {
  const { runService } = await import("./service.js");
  await runService();
  process.exit(0);
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};

// --- Argument parsing ---

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { token: "", gatewayUrl: "", port: 0, host: "" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if ((arg === "--token" || arg === "-t") && next) {
      result.token = next; i++;
    } else if ((arg === "--gateway" || arg === "-g") && next) {
      result.gatewayUrl = next; i++;
    } else if ((arg === "--port" || arg === "-p") && next) {
      result.port = parseInt(next, 10); i++;
    } else if (arg === "--host" && next) {
      result.host = next; i++;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return result;
}

function printHelp() {
  console.log(`
  \x1b[36mOpenClaw Office\x1b[0m — Visual monitoring frontend for OpenClaw

  \x1b[1mUsage:\x1b[0m
    openclaw-office [options]

  \x1b[1mOptions:\x1b[0m
    -t, --token <token>      Gateway auth token
    -g, --gateway <url>      Gateway WebSocket URL (default: ws://localhost:18789)
    -p, --port <port>        Server port (default: 5180, or PORT env)
    --host <host>            Bind address (default: 0.0.0.0)
    -h, --help               Show this help

  \x1b[1mToken auto-detection:\x1b[0m
    The token is resolved in this order:
    1. --token flag
    2. OPENCLAW_GATEWAY_TOKEN environment variable
    3. Auto-read from ~/.openclaw/openclaw.json

  \x1b[1mExamples:\x1b[0m
    openclaw-office
    openclaw-office --token my-secret-token
    openclaw-office --gateway ws://192.168.1.100:18789
    PORT=3000 openclaw-office

  \x1b[1mService management:\x1b[0m
    openclaw-office service install --token <token>    # Auto-start on login/boot
    openclaw-office service status                     # Check service status
    openclaw-office service stop                       # Stop the service
    openclaw-office service uninstall                  # Remove the service
    openclaw-office service help                       # Show service help
`);
}

// --- Token auto-detection from openclaw config file ---

function readTokenFromConfig() {
  const candidates = [
    join(homedir(), ".openclaw", "openclaw.json"),
    join(homedir(), ".clawdbot", "clawdbot.json"),
  ];
  for (const filePath of candidates) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const config = JSON.parse(raw);
      const token = config?.gateway?.auth?.token;
      if (token && typeof token === "string" && token.length > 0) {
        return { token, source: filePath };
      }
    } catch {
      // file not found or parse error
    }
  }
  return null;
}

function parseEnvFile(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    let value = rest.join("=").trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key.trim()] = value;
  }
  return values;
}

function readBranchReceiverEnv() {
  const profile = process.env.OPENCLAW_PROFILE || process.env.DELEGATE_BRANCH || "sicilia";
  const candidates = [
    process.env.OPENCLAW_BRANCH_RECEIVER_ENV,
    join(homedir(), ".config", `${profile}-delegate-receiver.env`),
    join(homedir(), ".config", "sicilia-delegate-receiver.env"),
  ].filter(Boolean);

  for (const filePath of candidates) {
    try {
      if (!existsSync(filePath)) {
        continue;
      }
      return { values: parseEnvFile(readFileSync(filePath, "utf-8")), source: filePath };
    } catch {
      // continue to next candidate
    }
  }
  return { values: {}, source: "" };
}

function readRegistryEnv() {
  const candidates = [
    process.env.OPENCLAW_REGISTRY_ENV,
    process.env.KASPAR_REGISTRY_ENV,
    join(homedir(), ".config", "kaspar-registry.env"),
    join(homedir(), ".config", "openclaw-node-bootstrap.env"),
  ].filter(Boolean);

  for (const filePath of candidates) {
    try {
      if (!existsSync(filePath)) {
        continue;
      }
      return { values: parseEnvFile(readFileSync(filePath, "utf-8")), source: filePath };
    } catch {
      // continue to next candidate
    }
  }
  return { values: {}, source: "" };
}

function normalizeBranchApiBase(rawUrl) {
  const value = String(rawUrl || "").trim().replace(/\/+$/u, "");
  if (!value) {
    return "";
  }
  return value.replace(/\/v1\/(kanban|delegate|report|status)$/u, "");
}

function normalizeBranchDisplayName(value) {
  const branch = String(value || "").trim();
  if (!branch) {
    return "";
  }
  if (/[A-Z]/u.test(branch) || branch.includes(" ")) {
    return branch;
  }
  return branch
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveBranchKanbanConfig() {
  const receiverEnv = readBranchReceiverEnv();
  const fileValues = receiverEnv.values;
  const branchId =
    process.env.OPENCLAW_BRANCH ||
    process.env.OPENCLAW_PROFILE ||
    process.env.DELEGATE_BRANCH ||
    fileValues.OPENCLAW_BRANCH ||
    fileValues.OPENCLAW_PROFILE ||
    fileValues.DELEGATE_BRANCH ||
    "";
  // Canonical rename: el nodo histórico "hq" se llama BAHAMAS desde
  // 2026-05-09. Auto-display sin requerir env var en cada deploy.
  // Ver gcloud-office/docs/RUNBOOK-RENAME-HQ-TO-BAHAMAS.md.
  const isHqLegacy = String(branchId || "").trim().toLowerCase() === "hq";
  const branchLabel =
    process.env.OPENCLAW_BRANCH_LABEL ||
    process.env.VITE_BRANCH_LABEL ||
    fileValues.OPENCLAW_BRANCH_LABEL ||
    fileValues.VITE_BRANCH_LABEL ||
    (isHqLegacy ? "BAHAMAS" : branchId);
  const inferredBase =
    fileValues.DELEGATE_BIND && fileValues.DELEGATE_PORT
      ? `http://${fileValues.DELEGATE_BIND}:${fileValues.DELEGATE_PORT}`
      : "";
  const baseUrl = normalizeBranchApiBase(
    process.env.OPENCLAW_BRANCH_API_BASE_URL ||
      process.env.OPENCLAW_BRANCH_KANBAN_URL ||
      process.env.OPENCLAW_DELEGATE_ENDPOINT ||
      inferredBase,
  );
  const token =
    process.env.OPENCLAW_BRANCH_DELEGATE_TOKEN ||
    process.env.OPENCLAW_KANBAN_TOKEN ||
    process.env.DELEGATION_TOKEN ||
    fileValues.DELEGATION_TOKEN ||
    "";

  return {
    baseUrl,
    token,
    branchId,
    branchLabel,
    source: baseUrl ? (receiverEnv.source || "environment") : "",
  };
}

function resolveRegistryConfig() {
  const registryEnv = readRegistryEnv();
  const values = registryEnv.values;
  return {
    baseUrl: String(
      process.env.KASPAR_REGISTRY_BASE_URL ||
        process.env.OPENCLAW_REGISTRY_API_URL ||
        values.KASPAR_REGISTRY_BASE_URL ||
        "",
    ).trim().replace(/\/+$/u, ""),
    token: String(
      process.env.KASPAR_REGISTRY_API_TOKEN ||
        process.env.OPENCLAW_REGISTRY_API_TOKEN ||
        values.KASPAR_REGISTRY_API_TOKEN ||
        "",
    ).trim(),
    source: registryEnv.source || "environment",
  };
}

async function requestJson(url, token, timeoutMs = 3000) {
  const upstreamUrl = new URL(url);
  const doRequest = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve) => {
    const req = doRequest(
      upstreamUrl,
      {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          if ((res.statusCode || 500) >= 400) {
            resolve(null);
            return;
          }
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("registry timeout")));
    req.on("error", () => resolve(null));
    req.end();
  });
}

async function resolveRegistryOfficeIdentity(branchId) {
  const registry = resolveRegistryConfig();
  if (!branchId || !registry.baseUrl || !registry.token) {
    return null;
  }
  const snapshot = await requestJson(`${registry.baseUrl}/v1/branches`, registry.token);
  const branches = snapshot && Array.isArray(snapshot.branches) ? snapshot.branches : [];
  const branch = branches.find((item) => item && item.branch_id === branchId);
  if (!branch) {
    return null;
  }
  const metadata = branch.metadata && typeof branch.metadata === "object" ? branch.metadata : {};
  const office = metadata.office && typeof metadata.office === "object" ? metadata.office : {};
  // Canonical rename: registry rows con branch_id="hq" sin display_name
  // explícito se renderan como "BAHAMAS". Ver canonical doc.
  const rawLabel = branch.display_name || office.branch_label || branch.branch_id || branchId;
  const labelWithRename = String(rawLabel || "").trim().toLowerCase() === "hq"
    ? "BAHAMAS"
    : rawLabel;
  const displayName = normalizeBranchDisplayName(
    labelWithRename,
  );
  return {
    officeTitle: String(office.title || DEFAULT_OFFICE_TITLE).trim() || DEFAULT_OFFICE_TITLE,
    branchLabel: displayName,
    source: registry.source,
  };
}

function commandResult(command, args, startedAt, exitCode, stdout, stderr, error = "") {
  return {
    name: command,
    command: `${command} ${args.join(" ")}`.trim(),
    durationMs: Date.now() - startedAt,
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    error: String(error || "").trim(),
  };
}

async function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const startedAt = Date.now();
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
      cwd: options.cwd || process.cwd(),
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve(commandResult(command, args, startedAt, 124, stdout, stderr, "timeout"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(commandResult(command, args, startedAt, 1, stdout, stderr, err.message || String(err)));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(commandResult(command, args, startedAt, Number(code ?? 0), stdout, stderr));
    });
  });
}

async function resolveBaseCommit() {
  const candidates = [
    process.env.OPENCLAW_BASE_REPO_DIR,
    process.env.OPENCLAW_INFRA_REPO_DIR,
    join(homedir(), "gcloud-office"),
    join(homedir(), "openclaw-workspaces", "murphy", "gcloud-office"),
    join(homedir(), "openclaw-workspaces", "cesar", "gcloud-office"),
  ].filter(Boolean);

  for (const repoDir of candidates) {
    try {
      if (!existsSync(join(repoDir, ".git"))) continue;
      const result = await runCommand("git", ["-C", repoDir, "rev-parse", "--short=7", "HEAD"], {
        timeoutMs: 5000,
      });
      if (result.exitCode === 0 && result.stdout) {
        return result.stdout;
      }
    } catch {
      // no-op
    }
  }
  return "";
}

function resolveNodeBranchId() {
  return String(
    process.env.OPENCLAW_BRANCH ||
      process.env.OPENCLAW_PROFILE ||
      process.env.DELEGATE_BRANCH ||
      config?.branchKanban?.branchId ||
      "",
  ).trim();
}

function resolveCapablancaServiceCandidates(branchId) {
  const explicit = String(process.env.OPENCLAW_CAPABLANCA_SERVICE || "").trim();
  const candidates = [];
  if (explicit) {
    candidates.push(explicit);
  }
  if (branchId) {
    candidates.push(`openclaw-capablanca-${branchId}.service`);
  }
  candidates.push("openclaw-capablanca.service");
  return [...new Set(candidates)];
}

async function triggerForkUpdateCheck() {
  const startedAt = Date.now();
  const branchId = resolveNodeBranchId();
  const rawSteps = [];

  for (const unit of resolveCapablancaServiceCandidates(branchId)) {
    const result = await runCommand("systemctl", ["--user", "start", unit], { timeoutMs: 120000 });
    rawSteps.push(result);
    if (result.exitCode === 0) {
      return {
        ok: true,
        result: {
          status: "ok",
          mode: "fork-capablanca",
          reason: `Capablanca ejecutado via ${unit}`,
          steps: rawSteps.map((step) => ({
            name: step.name,
            command: step.command,
            durationMs: step.durationMs,
          })),
          durationMs: Date.now() - startedAt,
        },
        restart: null,
      };
    }
  }

  const scriptPath = String(process.env.OPENCLAW_CAPABLANCA_SCRIPT || "").trim()
    || join(homedir(), "openclaw-workspaces", "capablanca", "deploy-office.sh");
  if (existsSync(scriptPath)) {
    const result = await runCommand("bash", [scriptPath], { timeoutMs: 300000 });
    rawSteps.push(result);
    if (result.exitCode === 0) {
      return {
        ok: true,
        result: {
          status: "ok",
          mode: "fork-capablanca",
          reason: `Capablanca ejecutado via script ${scriptPath}`,
          steps: rawSteps.map((step) => ({
            name: step.name,
            command: step.command,
            durationMs: step.durationMs,
          })),
          durationMs: Date.now() - startedAt,
        },
        restart: null,
      };
    }
  }

  const lastError = rawSteps.length > 0 ? rawSteps[rawSteps.length - 1] : null;
  return {
    ok: false,
    result: {
      status: "error",
      mode: "fork-capablanca",
      reason:
        lastError?.stderr ||
        lastError?.error ||
        "No se pudo ejecutar el update del fork via Capablanca.",
      steps: rawSteps.map((step) => ({
        name: step.name,
        command: step.command,
        durationMs: step.durationMs,
      })),
      durationMs: Date.now() - startedAt,
    },
    restart: null,
  };
}

// --- Config resolution ---

async function resolveConfig() {
  const args = parseArgs();

  let token = "";
  let tokenSource = "";

  if (args.token) {
    token = args.token;
    tokenSource = "command line --token";
  } else if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    token = process.env.OPENCLAW_GATEWAY_TOKEN;
    tokenSource = "OPENCLAW_GATEWAY_TOKEN env";
  } else {
    const fromFile = readTokenFromConfig();
    if (fromFile) {
      token = fromFile.token;
      tokenSource = fromFile.source;
    }
  }

  const gatewayUrl = args.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || "ws://localhost:18789";
  const port = args.port || parseInt(process.env.PORT || "5180", 10);
  const host = args.host || process.env.HOST || "0.0.0.0";
  const branchKanban = resolveBranchKanbanConfig();
  const registryIdentity = await resolveRegistryOfficeIdentity(branchKanban.branchId);
  const officeTitle =
    registryIdentity?.officeTitle ||
    process.env.OPENCLAW_OFFICE_TITLE ||
    process.env.VITE_OFFICE_TITLE ||
    DEFAULT_OFFICE_TITLE;
  const branchLabel = registryIdentity?.branchLabel || normalizeBranchDisplayName(branchKanban.branchLabel);

  return { token, tokenSource, gatewayUrl, port, host, branchKanban, officeTitle, branchLabel };
}

// --- HTTP Server ---

const config = await resolveConfig();
const baseCommit = await resolveBaseCommit();
const officeUpdateMode =
  process.env.OPENCLAW_UPDATE_MODE === "gateway" ? "gateway" : "fork-capablanca";

const runtimeConfig = JSON.stringify({
  gatewayUrl: config.gatewayUrl,
  gatewayToken: config.token,
  gatewayWsPath: "/gateway-ws",
  officeTitle: config.officeTitle,
  branchLabel: config.branchLabel,
  baseCommit,
  officeUpdateMode,
});
const configScript = `<script>window.__OPENCLAW_CONFIG__=${runtimeConfig};</script>`;
const gatewayWsPrefixes = new Set(["/gateway-ws", "/api/gateway/ws"]);

async function tryReadFile(filePath) {
  try {
    await access(filePath);
    return await readFile(filePath);
  } catch {
    return null;
  }
}

// Resuelve el path al HTML de guía operativa per-nodo.
// Override via env OPENCLAW_NODE_GUIDE_PATH; default usa OPENCLAW_PROFILE.
// El renderer canónico (gcloud-office/scripts/render-node-dashboard.py) lo
// genera ahí cada cycle del capablanca runner.
function nodeGuidePath() {
  const fromEnv = process.env.OPENCLAW_NODE_GUIDE_PATH;
  if (fromEnv) return fromEnv;
  const profile =
    process.env.OPENCLAW_PROFILE ||
    process.env.OPENCLAW_BRANCH ||
    process.env.DELEGATE_BRANCH ||
    config.branchKanban.branchId ||
    "default";
  return join(homedir(), `.openclaw-${profile}`, "dashboard", "node-dashboard.html");
}

async function serveNodeGuide(res) {
  const guidePath = nodeGuidePath();
  const buf = await tryReadFile(guidePath);
  if (!buf) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><html><body style="font-family:sans-serif;padding:2em">
       <h1>Node Guide no generado todavía</h1>
       <p>Esperado en <code>${guidePath}</code>.</p>
       <p>Genera la guía corriendo el capablanca runner del nodo, o manualmente:</p>
       <pre>python3 ~/gcloud-office/scripts/render-node-dashboard.py \\
    --branch &lt;branch&gt; \\
    --fleet ~/openclaw-workspaces/&lt;coordinator&gt;/FLEET.local.yml \\
    --out ${guidePath}</pre>
       <p>Detalle: <a href="https://github.com/SiteOneTech/gcloud-office/blob/main/openclaw-office/docs/13-PER-NODE-DASHBOARD.md">13-PER-NODE-DASHBOARD.md</a></p>
       </body></html>`,
    );
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(buf);
}

let indexHtmlCache = null;

async function getIndexHtml() {
  if (indexHtmlCache) return indexHtmlCache;
  const raw = await readFile(join(distDir, "index.html"), "utf-8");
  indexHtmlCache = raw.replace("</head>", `${configScript}\n</head>`);
  return indexHtmlCache;
}

function toHttpUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  return url;
}

function serializeUpgradeResponse(res) {
  const lines = [`HTTP/1.1 ${res.statusCode} ${res.statusMessage}`];
  for (const [key, value] of Object.entries(res.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        lines.push(`${key}: ${item}`);
      }
    } else if (typeof value !== "undefined") {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("\r\n");
  return lines.join("\r\n");
}

function writeSocketError(socket, statusCode, message) {
  if (socket.destroyed) {
    return;
  }
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
  );
  socket.destroy();
}

function proxyWsUpgrade(req, downstreamSocket, downstreamHead) {
  const upstreamUrl = toHttpUrl(config.gatewayUrl);
  const headers = {
    host: upstreamUrl.host,
    connection: "Upgrade",
    upgrade: "websocket",
    origin: upstreamUrl.origin,
    "sec-websocket-version": req.headers["sec-websocket-version"] || "13",
    "sec-websocket-key": req.headers["sec-websocket-key"],
  };
  if (req.headers["sec-websocket-protocol"]) {
    headers["sec-websocket-protocol"] = req.headers["sec-websocket-protocol"];
  }

  const doRequest = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const upstreamReq = doRequest(upstreamUrl, { method: "GET", headers });
  let settled = false;
  let upgraded = false;

  const fail = (statusCode, message) => {
    if (settled) {
      return;
    }
    settled = true;
    writeSocketError(downstreamSocket, statusCode, message);
  };

  upstreamReq.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    if (settled) {
      upstreamSocket.destroy();
      return;
    }
    settled = true;
    upgraded = true;

    if (downstreamSocket.destroyed) {
      upstreamSocket.destroy();
      return;
    }

    downstreamSocket.write(serializeUpgradeResponse(upstreamRes));

    if (downstreamHead.length > 0) {
      upstreamSocket.write(downstreamHead);
    }
    if (upstreamHead.length > 0) {
      downstreamSocket.write(upstreamHead);
    }

    downstreamSocket.pipe(upstreamSocket, { end: false });
    upstreamSocket.pipe(downstreamSocket, { end: false });

    const closeBoth = () => {
      if (!downstreamSocket.destroyed) {
        downstreamSocket.destroy();
      }
      if (!upstreamSocket.destroyed) {
        upstreamSocket.destroy();
      }
    };

    downstreamSocket.on("error", closeBoth);
    upstreamSocket.on("error", closeBoth);
    downstreamSocket.on("close", closeBoth);
    upstreamSocket.on("close", closeBoth);
  });

  upstreamReq.on("response", (upstreamRes) => {
    upstreamRes.resume();
    fail(upstreamRes.statusCode || 502, upstreamRes.statusMessage || "Bad Gateway");
  });
  upstreamReq.on("error", () => {
    fail(502, "Bad Gateway");
  });
  downstreamSocket.on("error", () => {
    if (!upgraded) {
      upstreamReq.destroy();
    }
  });
  downstreamSocket.on("close", () => {
    if (!upgraded) {
      upstreamReq.destroy();
    }
  });

  upstreamReq.end();
}

// --- Chat history file-based cache (per-day sharded) ---
//
// Directory layout:
//   ~/.openclaw/office-cache/chat/
//     _sessions.json                         — session list index
//     {safe-session-key}/                    — one dir per session
//       _meta.json                           — { sessionKey, agentId, cachedAt }
//       2026-03-27.json                      — messages for that day
//       2026-03-26.json
//       ...
//
// On read  → scan all day-files in the session dir, merge & sort by timestamp
// On write → only append/overwrite the current-day file with today's messages

const CHAT_CACHE_DIR = join(homedir(), ".openclaw", "office-cache", "chat");
const SESSIONS_FILE = join(CHAT_CACHE_DIR, "_sessions.json");
const MAX_DAY_FILES = 90;

function ensureCacheDir() {
  if (!existsSync(CHAT_CACHE_DIR)) {
    mkdirSync(CHAT_CACHE_DIR, { recursive: true });
  }
}

ensureCacheDir();

function safeSessionDirName(sessionKey) {
  return sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateStringFromTimestamp(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isDayFile(name) {
  return /^\d{4}-\d{2}-\d{2}\.json$/u.test(name);
}

async function readJsonFile(filePath) {
  try {
    await access(filePath);
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath, data) {
  await writeFile(filePath, JSON.stringify(data), "utf-8");
}

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch { /* already exists */ }
}

async function safeReaddir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function readSessionMessages(sessionDir) {
  const files = await safeReaddir(sessionDir);
  const dayFiles = files.filter(isDayFile).sort();
  const allMessages = [];
  for (const file of dayFiles) {
    const data = await readJsonFile(join(sessionDir, file));
    if (Array.isArray(data)) {
      allMessages.push(...data);
    }
  }
  allMessages.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  return allMessages;
}

async function writeSessionMessages(sessionDir, sessionKey, agentId, messages) {
  await ensureDir(sessionDir);

  // Write meta
  await writeJsonFile(join(sessionDir, "_meta.json"), {
    sessionKey,
    agentId,
    cachedAt: Date.now(),
    messageCount: messages.length,
  });

  // Group messages by day
  const byDay = new Map();
  for (const msg of messages) {
    const day = dateStringFromTimestamp(msg.timestamp ?? Date.now());
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(msg);
  }

  // Write each day file
  for (const [day, dayMsgs] of byDay) {
    await writeJsonFile(join(sessionDir, `${day}.json`), dayMsgs);
  }

  // Prune old day files beyond MAX_DAY_FILES
  const files = await safeReaddir(sessionDir);
  const dayFiles = files.filter(isDayFile).sort();
  if (dayFiles.length > MAX_DAY_FILES) {
    const toRemove = dayFiles.slice(0, dayFiles.length - MAX_DAY_FILES);
    for (const file of toRemove) {
      try { await unlink(join(sessionDir, file)); } catch { /* ok */ }
    }
  }
}

async function deleteSessionDir(sessionDir) {
  const files = await safeReaddir(sessionDir);
  for (const file of files) {
    try { await unlink(join(sessionDir, file)); } catch { /* ok */ }
  }
  try {
    const { rmdir } = await import("node:fs/promises");
    await rmdir(sessionDir);
  } catch { /* ok */ }
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function branchApiPath(pathname) {
  if (pathname === "/api/branch-kanban") {
    return "/v1/kanban";
  }
  if (pathname === "/api/branch-report") {
    return "/v1/delegate";
  }
  if (pathname === "/api/branch-kanban/tasks") {
    return "/v1/kanban/tasks";
  }
  if (pathname === "/api/branch-kanban/events") {
    return "/v1/kanban/events";
  }
  return "";
}

async function requestBranchApi({ upstreamPath, method, body }) {
  const branch = config.branchKanban;
  if (!branch.baseUrl || !branch.token) {
    return {
      statusCode: 503,
      data: {
        ok: false,
        error: "Branch Kanban is not configured",
        endpoint_configured: Boolean(branch.baseUrl),
        token_configured: Boolean(branch.token),
      },
    };
  }

  const upstreamUrl = new URL(upstreamPath, `${branch.baseUrl}/`);
  const payload = body == null ? null : Buffer.from(JSON.stringify(body), "utf-8");
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${branch.token}`,
  };
  if (payload) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    headers["Content-Length"] = String(payload.length);
  }

  const doRequest = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve) => {
    const upstreamReq = doRequest(
      upstreamUrl,
      { method, headers, timeout: 10000 },
      (upstreamRes) => {
        const chunks = [];
        upstreamRes.on("data", (chunk) => chunks.push(chunk));
        upstreamRes.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          try {
            resolve({
              statusCode: upstreamRes.statusCode || 502,
              data: raw ? JSON.parse(raw) : {},
            });
          } catch {
            resolve({
              statusCode: upstreamRes.statusCode || 502,
              data: { ok: false, error: "Invalid JSON from branch receiver" },
            });
          }
        });
      },
    );

    upstreamReq.on("timeout", () => {
      upstreamReq.destroy(new Error("branch receiver timeout"));
    });
    upstreamReq.on("error", (err) => {
      resolve({ statusCode: 502, data: { ok: false, error: String(err.message || err) } });
    });
    if (payload) {
      upstreamReq.write(payload);
    }
    upstreamReq.end();
  });
}

async function handleBranchKanbanApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  const upstreamPath = branchApiPath(pathname);
  if (!upstreamPath) {
    return false;
  }
  const allowed =
    req.method === "GET" ||
    (req.method === "POST" && (pathname.endsWith("/tasks") || pathname.endsWith("/events")));
  if (!allowed) {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return true;
  }

  const body = req.method === "GET" ? null : await readRequestBody(req);
  const result = await requestBranchApi({ upstreamPath, method: req.method, body });
  sendJson(res, result.statusCode, result.data);
  return true;
}

async function handleChatCacheApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  // GET /api/chat-cache/sessions
  if (pathname === "/api/chat-cache/sessions" && req.method === "GET") {
    const data = await readJsonFile(SESSIONS_FILE);
    sendJson(res, 200, { sessions: data?.sessions ?? [], cachedAt: data?.cachedAt ?? null });
    return true;
  }

  // PUT /api/chat-cache/sessions
  if (pathname === "/api/chat-cache/sessions" && req.method === "PUT") {
    const body = await readRequestBody(req);
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    await writeJsonFile(SESSIONS_FILE, { sessions, cachedAt: Date.now() });
    sendJson(res, 200, { ok: true });
    return true;
  }

  // GET /api/chat-cache/messages?sessionKey=xxx
  if (pathname === "/api/chat-cache/messages" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionKey = url.searchParams.get("sessionKey");
    if (!sessionKey) {
      sendJson(res, 400, { error: "Missing sessionKey" });
      return true;
    }
    const sessionDir = join(CHAT_CACHE_DIR, safeSessionDirName(sessionKey));
    const meta = await readJsonFile(join(sessionDir, "_meta.json"));
    const messages = await readSessionMessages(sessionDir);
    sendJson(res, 200, {
      messages,
      sessionKey: meta?.sessionKey ?? sessionKey,
      agentId: meta?.agentId ?? null,
      cachedAt: meta?.cachedAt ?? null,
    });
    return true;
  }

  // PUT /api/chat-cache/messages
  if (pathname === "/api/chat-cache/messages" && req.method === "PUT") {
    const body = await readRequestBody(req);
    const sessionKey = body.sessionKey;
    if (!sessionKey || typeof sessionKey !== "string") {
      sendJson(res, 400, { error: "Missing sessionKey" });
      return true;
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const agentId = body.agentId ?? null;
    const sessionDir = join(CHAT_CACHE_DIR, safeSessionDirName(sessionKey));
    await writeSessionMessages(sessionDir, sessionKey, agentId, messages);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // GET /api/chat-cache/all-messages
  if (pathname === "/api/chat-cache/all-messages" && req.method === "GET") {
    ensureCacheDir();
    const entries = await safeReaddir(CHAT_CACHE_DIR);
    const result = [];
    for (const entry of entries) {
      if (entry.startsWith("_") || entry.endsWith(".json")) continue;
      const sessionDir = join(CHAT_CACHE_DIR, entry);
      const meta = await readJsonFile(join(sessionDir, "_meta.json"));
      if (meta?.sessionKey) {
        result.push({
          sessionKey: meta.sessionKey,
          agentId: meta.agentId ?? null,
          messageCount: meta.messageCount ?? 0,
          cachedAt: meta.cachedAt ?? null,
        });
      }
    }
    sendJson(res, 200, { sessions: result });
    return true;
  }

  // DELETE /api/chat-cache/messages?sessionKey=xxx
  if (pathname === "/api/chat-cache/messages" && req.method === "DELETE") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionKey = url.searchParams.get("sessionKey");
    if (!sessionKey) {
      sendJson(res, 400, { error: "Missing sessionKey" });
      return true;
    }
    const sessionDir = join(CHAT_CACHE_DIR, safeSessionDirName(sessionKey));
    await deleteSessionDir(sessionDir);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith("/api/branch-kanban") || pathname === "/api/branch-report") {
    try {
      const handled = await handleBranchKanbanApi(req, res, pathname);
      if (handled) return;
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err) });
      return;
    }
  }

  if (pathname === "/api/platform" || pathname.startsWith("/api/platform/")) {
    try {
      const handled = await handlePlatformApiProxy(req, res, pathname, url.search);
      if (handled) return;
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err) });
      return;
    }
  }

  if (pathname === "/api/node/fork-update-check") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }
    try {
      const result = await triggerForkUpdateCheck();
      sendJson(res, result.ok ? 200 : 500, result);
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        result: {
          status: "error",
          mode: "fork-capablanca",
          reason: String(err),
          steps: [],
          durationMs: 0,
        },
        restart: null,
      });
    }
    return;
  }

  if (pathname === "/kanban") {
    res.writeHead(302, { Location: "/#/kanban" });
    res.end();
    return;
  }

  // Per-node operational guide (HTML generado por gcloud-office/scripts/render-node-dashboard.py).
  // Sirve directo (no SPA) para abrirlo en nueva tab desde la TopBar.
  if (pathname === "/node-guide" || pathname === "/node-guide/") {
    try {
      await serveNodeGuide(res);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Error sirviendo node-guide: ${err}`);
    }
    return;
  }

  // Chat cache REST API
  if (pathname.startsWith("/api/chat-cache/")) {
    try {
      const handled = await handleChatCacheApi(req, res, pathname);
      if (handled) return;
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
      return;
    }
  }

  // Serve injected index.html for root and SPA routes
  if (pathname === "/" || pathname === "/index.html") {
    const html = await getIndexHtml();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // Try serving static file
  const filePath = join(distDir, pathname);
  const content = await tryReadFile(filePath);

  if (content) {
    const ext = extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
    return;
  }

  // SPA fallback for client-side routes
  const html = await getIndexHtml();
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (!gatewayWsPrefixes.has(pathname)) {
    writeSocketError(socket, 404, "Not Found");
    return;
  }
  proxyWsUpgrade(req, socket, head);
});

server.listen(config.port, config.host, () => {
  console.log();
  console.log("  \x1b[36m\u{1F3E2} OpenClaw Office\x1b[0m");
  console.log();
  console.log(`  \x1b[32m\u{27A1}\x1b[0m  Local:   \x1b[36mhttp://localhost:${config.port}\x1b[0m`);
  if (config.host === "0.0.0.0") {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          console.log(`  \x1b[32m\u{27A1}\x1b[0m  Network: \x1b[36mhttp://${net.address}:${config.port}\x1b[0m`);
        }
      }
    }
  }
  console.log();
  console.log(`  \x1b[32m\u{27A1}\x1b[0m  Gateway: \x1b[33m${config.gatewayUrl}\x1b[0m`);
  if (config.branchKanban.baseUrl) {
    console.log(`  \x1b[32m\u{27A1}\x1b[0m  Kanban:  \x1b[33m${config.branchKanban.baseUrl}\x1b[0m`);
  }
  if (config.token) {
    console.log(`  \x1b[32m\u{2713}\x1b[0m  Token:   \x1b[32mloaded\x1b[0m \x1b[90m(from ${config.tokenSource})\x1b[0m`);
  } else {
    console.log(`  \x1b[33m\u{26A0}\x1b[0m  Token:   \x1b[33mnot found\x1b[0m`);
    console.log();
    console.log("  \x1b[90mTo connect to Gateway, provide a token:\x1b[0m");
    console.log("  \x1b[90m  openclaw-office --token <your-token>\x1b[0m");
    console.log("  \x1b[90m  or install openclaw CLI and the token will be auto-detected\x1b[0m");
  }
  console.log();
  console.log("  Press \x1b[1mCtrl+C\x1b[0m to stop");
  console.log();
});
