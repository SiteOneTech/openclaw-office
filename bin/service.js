#!/usr/bin/env node

/**
 * Cross-platform service management entry point.
 *
 * Detects the current platform and delegates to the appropriate
 * service manager (launchd for macOS, systemd for Linux).
 *
 * Usage:
 *   openclaw-office service install --token <token>
 *   openclaw-office service uninstall
 *   openclaw-office service start|stop|restart|status|log
 */

import { platform } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// --- Colors ---
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function printLog(msg, color = "") { console.log(`${color}${msg}${C.reset}`); }
function err(msg) { console.error(`${C.red}  \u2717 ${msg}${C.reset}`); }
function warn(msg) { printLog(`  \u2022 ${msg}`, C.yellow); }

// --- Platform detection ---

function detectPlatform() {
  const p = platform();
  if (p === "darwin") return "macos";
  if (p === "linux") return "linux";
  if (p === "win32") return "windows";
  return "unknown";
}

// --- Token auto-detection ---

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
    } catch { /* ok */ }
  }
  return null;
}

// --- Argument parsing ---

function parseServiceArgs() {
  // Skip argv[0] and argv[1] (node + script), plus argv[2] ("service")
  const args = process.argv.slice(3);
  const command = args[0] || "";
  const config = { token: "", gatewayUrl: "", port: 0, host: "", follow: false };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if ((arg === "--token" || arg === "-t") && next) {
      config.token = next; i++;
    } else if ((arg === "--gateway" || arg === "-g") && next) {
      config.gatewayUrl = next; i++;
    } else if ((arg === "--port" || arg === "-p") && next) {
      config.port = parseInt(next, 10); i++;
    } else if (arg === "--host" && next) {
      config.host = next; i++;
    } else if (arg === "--follow" || arg === "-f") {
      config.follow = true;
    } else if (arg === "--help" || arg === "-h") {
      config._help = true;
    }
  }

  return { command, config };
}

// --- Main ---

async function main() {
  const { command, config } = parseServiceArgs();

  if (config._help || !command) {
    printGeneralHelp();
    return;
  }

  const plat = detectPlatform();

  if (plat === "windows") {
    err("Windows service management is not yet supported.");
    warn("Please use Task Scheduler or run openclaw-office manually.");
    process.exit(1);
  }

  if (plat === "unknown") {
    err(`Unsupported platform: ${platform()}`);
    process.exit(1);
  }

  // Import platform-specific manager
  let manager;
  if (plat === "macos") {
    manager = await import("./service-macos.js");
  } else {
    manager = await import("./service-linux.js");
  }

  // Auto-detect token for install if not provided
  if (command === "install" && !config.token && !process.env.OPENCLAW_GATEWAY_TOKEN) {
    const fromFile = readTokenFromConfig();
    if (fromFile) {
      config.token = fromFile.token;
    }
  }

  // Also check env var
  if (!config.token && process.env.OPENCLAW_GATEWAY_TOKEN) {
    config.token = process.env.OPENCLAW_GATEWAY_TOKEN;
  }

  if (command === "help") {
    printGeneralHelp();
    return;
  }

  // Route to manager function
  const validCommands = ["install", "uninstall", "start", "stop", "restart", "status", "log"];
  if (!validCommands.includes(command)) {
    err(`Unknown command: ${command}`);
    printGeneralHelp();
    process.exit(1);
  }

  if (manager[command] || (command === "log" && manager.showLogs)) {
    if (command === "log") {
      await manager.showLogs(config.follow);
    } else {
      await manager[command](config);
    }
  }
}

function printGeneralHelp() {
  console.log(`
  ${C.cyan}\u{1F3E2} OpenClaw Office — Service Management${C.reset}

  ${C.bold}Usage:${C.reset}
    openclaw-office service <command> [options]

  ${C.bold}Commands:${C.reset}
    install     Install as system service (auto-start on login/boot)
    uninstall   Remove the system service
    start       Start the service
    stop        Stop the service
    restart     Restart the service
    status      Show service status
    log         Show service logs

  ${C.bold}Options:${C.reset}
    --token <token>      Gateway auth token (required for install)
    --gateway <url>      Gateway WebSocket URL
    --port <port>        Server port (default: 5180)
    --host <host>        Bind address (default: 0.0.0.0)
    --follow, -f         Follow log output (log command only)
    -h, --help           Show this help

  ${C.bold}Token auto-detection:${C.reset}
    If --token is omitted, the service installer will try to auto-detect
    the token from ~/.openclaw/openclaw.json or the OPENCLAW_GATEWAY_TOKEN env var.

  ${C.bold}Examples:${C.reset}
    openclaw-office service install --token my-secret-token
    openclaw-office service install --token my-token --port 3000
    openclaw-office service status
    openclaw-office service log --follow
    openclaw-office service stop
    openclaw-office service uninstall
`);
}

/**
 * Entry point called from bin/openclaw-office.js.
 * @returns {Promise<void>}
 */
export async function runService() {
  try {
    await main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
