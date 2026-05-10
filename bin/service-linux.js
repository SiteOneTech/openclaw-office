#!/usr/bin/env node

/**
 * Linux systemd service manager for openclaw-office.
 *
 * Manages the OpenClaw Office service via systemd --user.
 * Commands: install, uninstall, start, stop, restart, status, log
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const SYSTEMD_DIR = join(homedir(), ".config", "systemd", "user");
const SERVICE_NAME = "openclaw-office.service";
const SERVICE_PATH = join(SYSTEMD_DIR, SERVICE_NAME);
const NODE_BIN = process.execPath;
const SERVER_SCRIPT = join(__dirname, "openclaw-office.js");
const LOG_DIR = join(homedir(), ".local", "state", "openclaw-office");
const STDOUT_LOG = join(LOG_DIR, "openclaw-office.log");
const STDERR_LOG = join(LOG_DIR, "openclaw-office-error.log");

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
function ok(msg) { printLog(`  \u2713 ${msg}`, C.green); }
function err(msg) { printLog(`  \u2717 ${msg}`, C.red); }
function info(msg) { printLog(`  \u2022 ${msg}`, C.cyan); }
function warn(msg) { printLog(`  \u2022 ${msg}`, C.yellow); }
function dim(msg) { printLog(`    ${msg}`, C.gray); }

// --- Helpers ---

function systemctl(args) {
  try {
    execSync(`systemctl --user ${args}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function isEnabled() {
  return systemctl(`is-enabled ${SERVICE_NAME}`);
}

function isActive() {
  return systemctl(`is-active ${SERVICE_NAME}`);
}

function generateService(config) {
  const args = [];
  args.push(SERVER_SCRIPT);
  if (config.gatewayUrl) args.push(`--gateway ${config.gatewayUrl}`);
  if (config.port) args.push(`--port ${config.port}`);
  if (config.host) args.push(`--host ${config.host}`);
  if (config.token) args.push(`--token ${config.token}`);

  return `[Unit]
Description=OpenClaw Office — Multi-Agent Monitoring Console
After=network.target

[Service]
Type=simple
ExecStart=${NODE_BIN} ${args.join(" ")}
Restart=on-failure
RestartSec=5
StandardOutput=append:${STDOUT_LOG}
StandardError=append:${STDERR_LOG}
Environment=HOME=${homedir()}
Environment=PATH=/usr/local/bin:/usr/bin:/bin
WorkingDirectory=${__dirname}

[Install]
WantedBy=default.target
`;
}

function generateTimer(config) {
  return `[Unit]
Description=Restart OpenClaw Office if not running
[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
`;
}

// --- Commands ---

/**
 * @param {{ token: string, gatewayUrl?: string, port?: number, host?: string }} config
 */
export async function install(config) {
  if (!config.token) {
    err("Token is required for service installation.");
    info("Provide via --token flag or it will be auto-detected from ~/.openclaw/openclaw.json");
    process.exit(1);
  }

  // Ensure directories
  if (!existsSync(SYSTEMD_DIR)) {
    mkdirSync(SYSTEMD_DIR, { recursive: true });
  }
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  // Reload systemd user daemon
  systemctl("daemon-reload");

  // Stop existing service if active
  if (isActive()) {
    warn("Existing service found, stopping...");
    systemctl(`stop ${SERVICE_NAME}`);
  }

  // Write service file
  const service = generateService(config);
  writeFileSync(SERVICE_PATH, service, "utf-8");
  ok(`Service file written: ${SERVICE_PATH}`);

  // Reload and enable
  systemctl("daemon-reload");
  systemctl(`enable ${SERVICE_NAME}`);
  ok("Service enabled");

  // Start the service
  systemctl(`start ${SERVICE_NAME}`);
  ok("Service started");

  printLog("");
  ok("OpenClaw Office service installed successfully!");
  printLog("");
  info(`Service file: ${SERVICE_PATH}`);
  info(`Stdout log: ${STDOUT_LOG}`);
  info(`Stderr log: ${STDERR_LOG}`);
  printLog("");
  info("The service will auto-start on boot and restart on failure.");
  dim("To manage: systemctl --user start|stop|restart|status openclaw-office.service");
  dim("To uninstall: openclaw-office service uninstall");
}

export function uninstall() {
  if (!existsSync(SERVICE_PATH)) {
    warn("Service not installed. Nothing to do.");
    return;
  }

  if (isActive()) {
    info("Stopping running service...");
    systemctl(`stop ${SERVICE_NAME}`);
    ok("Service stopped");
  }

  systemctl(`disable ${SERVICE_NAME}`);
  systemctl("daemon-reload");

  try {
    unlinkSync(SERVICE_PATH);
    ok(`Service file removed: ${SERVICE_PATH}`);
  } catch {
    err("Failed to remove service file");
    process.exitCode = 1;
  }

  systemctl("daemon-reload");
  printLog("");
  ok("OpenClaw Office service uninstalled.");
}

export function start() {
  if (!existsSync(SERVICE_PATH)) {
    err("Service not installed. Run: openclaw-office service install --token <token>");
    process.exit(1);
  }
  if (isActive()) {
    warn("Service is already running.");
    return;
  }
  systemctl(`start ${SERVICE_NAME}`);
  if (isActive()) {
    ok("Service started");
  } else {
    err("Failed to start service. Check logs:");
    dim(`journalctl --user -u ${SERVICE_NAME} --no-pager -n 20`);
    process.exitCode = 1;
  }
}

export function stop() {
  if (!isActive()) {
    warn("Service is not running.");
    return;
  }
  systemctl(`stop ${SERVICE_NAME}`);
  ok("Service stopped");
}

export function restart() {
  if (!existsSync(SERVICE_PATH)) {
    err("Service not installed. Run: openclaw-office service install --token <token>");
    process.exit(1);
  }
  systemctl(`restart ${SERVICE_NAME}`);
  ok("Service restarted");
}

export function status() {
  if (!existsSync(SERVICE_PATH)) {
    warn("Service not installed");
    printLog("");
    dim("Install with: openclaw-office service install --token <token>");
    return;
  }

  info(`Service file: ${SERVICE_PATH}`);

  if (isActive()) {
    ok("Status: active (running)");
  } else {
    err("Status: inactive (dead)");
  }

  if (isEnabled()) {
    ok("Enabled: yes (auto-start on boot)");
  } else {
    warn("Enabled: no");
  }

  // Show recent journal entries
  try {
    const journal = execSync(
      `journalctl --user -u ${SERVICE_NAME} --no-pager -n 10 2>/dev/null || echo "(journalctl not available)"`,
      { stdio: "pipe" }
    ).toString();
    if (journal.trim()) {
      printLog("");
      info("Recent journal entries:");
      dim(journal.trim());
    }
  } catch { /* ok */ }
}

export function showLogs(follow = false) {
  // Try journalctl first, fall back to file
  try {
    if (follow) {
      execSync(`journalctl --user -u ${SERVICE_NAME} -f 2>/dev/null`, { stdio: "inherit" });
      return;
    } else {
      const output = execSync(
        `journalctl --user -u ${SERVICE_NAME} --no-pager -n 100 2>/dev/null`,
        { stdio: "pipe" }
      ).toString();
      if (output.trim()) {
        console.log(output.trim());
        return;
      }
    }
  } catch { /* fall back to file */ }

  // Fall back to file-based log
  if (!existsSync(STDOUT_LOG)) {
    warn("No log file found.");
    return;
  }
  try {
    if (follow) {
      execSync(`tail -f "${STDOUT_LOG}"`, { stdio: "inherit" });
    } else {
      const content = readFileSync(STDOUT_LOG, "utf-8");
      console.log(content);
    }
  } catch (e) {
    err("Failed to read log file");
  }
}

export function printHelp() {
  console.log(`
  ${C.cyan}OpenClaw Office — Service Management (Linux)${C.reset}

  ${C.bold}Usage:${C.reset}
    openclaw-office service <command> [options]

  ${C.bold}Commands:${C.reset}
    install     Install as a systemd --user service (auto-start on boot)
    uninstall   Remove the systemd service
    start       Start the service
    stop        Stop the service
    restart     Restart the service
    status      Show service status
    log         Show service logs (add --follow to tail)

  ${C.bold}Install options:${C.reset}
    --token <token>      Gateway auth token (required)
    --gateway <url>      Gateway WebSocket URL
    --port <port>        Server port (default: 5180)
    --host <host>        Bind address (default: 0.0.0.0)

  ${C.bold}Examples:${C.reset}
    openclaw-office service install --token my-token
    openclaw-office service install --token my-token --port 3000
    openclaw-office service status
    openclaw-office service log --follow
`);
}
