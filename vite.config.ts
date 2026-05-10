import { resolve, join } from "node:path";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, readdir, unlink, access, mkdir, rmdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));

// Inject a short commit SHA so builds from branches with the same package
// version can still be distinguished in the TopBar.
const appCommit = (() => {
  const fromEnv = process.env.VITE_APP_COMMIT || process.env.GIT_COMMIT;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
  } catch {
    return "unknown";
  }
})();

const rawGatewayUrl = process.env.OPENCLAW_GATEWAY_URL || process.env.VITE_GATEWAY_URL || "ws://localhost:18789";
const gatewayUrl = new URL(rawGatewayUrl);
const gatewayTarget = `${gatewayUrl.protocol === "wss:" ? "https:" : gatewayUrl.protocol === "ws:" ? "http:" : gatewayUrl.protocol}//${gatewayUrl.host}`;
const gatewayPath = `${gatewayUrl.pathname}${gatewayUrl.search}` || "/";

// --- Per-day sharded chat cache helpers (shared with bin/openclaw-office.js) ---

const CHAT_CACHE_DIR = join(homedir(), ".openclaw", "office-cache", "chat");
const MAX_DAY_FILES = 90;

function ensureCacheDir(): void {
  if (!existsSync(CHAT_CACHE_DIR)) {
    mkdirSync(CHAT_CACHE_DIR, { recursive: true });
  }
}

function safeSessionDirName(sessionKey: string): string {
  return sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function dateStringFromTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDayFile(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\.json$/u.test(name);
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    await access(filePath);
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data), "utf-8");
}

async function safeReaddir(dir: string): Promise<string[]> {
  try { return await readdir(dir); } catch { return []; }
}

interface MsgLike { timestamp?: number; [k: string]: unknown }

async function readSessionMessages(sessionDir: string): Promise<MsgLike[]> {
  const files = (await safeReaddir(sessionDir)).filter(isDayFile).sort();
  const all: MsgLike[] = [];
  for (const f of files) {
    const data = await readJsonFile(join(sessionDir, f));
    if (Array.isArray(data)) all.push(...(data as MsgLike[]));
  }
  all.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  return all;
}

async function writeSessionMessages(
  sessionDir: string, sessionKey: string, agentId: string | null, messages: MsgLike[],
): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  await writeJsonFile(join(sessionDir, "_meta.json"), {
    sessionKey, agentId, cachedAt: Date.now(), messageCount: messages.length,
  });
  const byDay = new Map<string, MsgLike[]>();
  for (const msg of messages) {
    const day = dateStringFromTimestamp(msg.timestamp ?? Date.now());
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(msg);
  }
  for (const [day, dayMsgs] of byDay) {
    await writeJsonFile(join(sessionDir, `${day}.json`), dayMsgs);
  }
  const dayFiles = (await safeReaddir(sessionDir)).filter(isDayFile).sort();
  if (dayFiles.length > MAX_DAY_FILES) {
    for (const f of dayFiles.slice(0, dayFiles.length - MAX_DAY_FILES)) {
      try { await unlink(join(sessionDir, f)); } catch { /* ok */ }
    }
  }
}

async function deleteSessionDir(sessionDir: string): Promise<void> {
  for (const f of await safeReaddir(sessionDir)) {
    try { await unlink(join(sessionDir, f)); } catch { /* ok */ }
  }
  try { await rmdir(sessionDir); } catch { /* ok */ }
}

function chatCacheMiddleware(): Plugin {
  ensureCacheDir();
  const SESSIONS_FILE = join(CHAT_CACHE_DIR, "_sessions.json");

  return {
    name: "chat-cache-api",
    configureServer(server) {
      server.middlewares.use(async (incomingReq, res, next) => {
        const req = incomingReq as unknown as {
          url?: string; method?: string;
          headers: Record<string, string | undefined>;
          on: (event: string, handler: (...args: unknown[]) => void) => void;
        };
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const pathname = url.pathname;

        if (!pathname.startsWith("/api/chat-cache/")) { next(); return; }

        const sendJson = (statusCode: number, data: unknown) => {
          const body = JSON.stringify(data);
          res.writeHead(statusCode, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(body);
        };

        const readBody = (): Promise<Record<string, unknown>> =>
          new Promise((resolve, reject) => {
            const parts: string[] = [];
            req.on("data", (chunk: unknown) => parts.push(String(chunk)));
            req.on("end", () => {
              try {
                const raw = parts.join("");
                resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
              } catch (err) { reject(err); }
            });
            req.on("error", (err: unknown) => reject(err));
          });

        try {
          if (req.method === "OPTIONS") {
            res.writeHead(204, {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            });
            res.end();
            return;
          }

          if (pathname === "/api/chat-cache/sessions" && req.method === "GET") {
            const data = await readJsonFile(SESSIONS_FILE);
            sendJson(200, { sessions: (data?.sessions as unknown[]) ?? [], cachedAt: data?.cachedAt ?? null });
            return;
          }

          if (pathname === "/api/chat-cache/sessions" && req.method === "PUT") {
            const body = await readBody();
            await writeJsonFile(SESSIONS_FILE, { sessions: Array.isArray(body.sessions) ? body.sessions : [], cachedAt: Date.now() });
            sendJson(200, { ok: true });
            return;
          }

          if (pathname === "/api/chat-cache/messages" && req.method === "GET") {
            const sessionKey = url.searchParams.get("sessionKey");
            if (!sessionKey) { sendJson(400, { error: "Missing sessionKey" }); return; }
            const sessionDir = join(CHAT_CACHE_DIR, safeSessionDirName(sessionKey));
            const meta = await readJsonFile(join(sessionDir, "_meta.json"));
            const messages = await readSessionMessages(sessionDir);
            sendJson(200, { messages, sessionKey: (meta?.sessionKey as string) ?? sessionKey, agentId: meta?.agentId ?? null, cachedAt: meta?.cachedAt ?? null });
            return;
          }

          if (pathname === "/api/chat-cache/messages" && req.method === "PUT") {
            const body = await readBody();
            const sessionKey = body.sessionKey as string | undefined;
            if (!sessionKey) { sendJson(400, { error: "Missing sessionKey" }); return; }
            const sessionDir = join(CHAT_CACHE_DIR, safeSessionDirName(sessionKey));
            await writeSessionMessages(sessionDir, sessionKey, (body.agentId as string | null) ?? null, Array.isArray(body.messages) ? (body.messages as MsgLike[]) : []);
            sendJson(200, { ok: true });
            return;
          }

          if (pathname === "/api/chat-cache/all-messages" && req.method === "GET") {
            const entries = await safeReaddir(CHAT_CACHE_DIR);
            const result: Array<Record<string, unknown>> = [];
            for (const entry of entries) {
              if (entry.startsWith("_") || entry.endsWith(".json")) continue;
              const meta = await readJsonFile(join(CHAT_CACHE_DIR, entry, "_meta.json"));
              if (meta?.sessionKey) {
                result.push({ sessionKey: meta.sessionKey, agentId: meta.agentId ?? null, messageCount: meta.messageCount ?? 0, cachedAt: meta.cachedAt ?? null });
              }
            }
            sendJson(200, { sessions: result });
            return;
          }

          if (pathname === "/api/chat-cache/messages" && req.method === "DELETE") {
            const sessionKey = url.searchParams.get("sessionKey");
            if (!sessionKey) { sendJson(400, { error: "Missing sessionKey" }); return; }
            await deleteSessionDir(join(CHAT_CACHE_DIR, safeSessionDirName(sessionKey)));
            sendJson(200, { ok: true });
            return;
          }

          next();
        } catch (err) {
          sendJson(500, { error: String(err) });
        }
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(appCommit),
  },
  plugins: [react(), tailwindcss(), chatCacheMiddleware()],
  resolve: {
    alias: {
      "@": resolve(rootDir, "./src"),
    },
  },
  server: {
    port: 5180,
    proxy: {
      "/gateway-ws": {
        target: gatewayTarget,
        ws: true,
        changeOrigin: true,
        rewrite: () => gatewayPath,
        configure: (proxy) => {
          proxy.on("error", () => {});
          proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
            socket.on("error", () => {});
          });
        },
      },
      "/api/gateway/ws": {
        target: gatewayTarget,
        ws: true,
        changeOrigin: true,
        rewrite: () => gatewayPath,
        configure: (proxy) => {
          proxy.on("error", () => {});
          proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
            socket.on("error", () => {});
          });
        },
      },
    },
  },
});
