#!/usr/bin/env node

/**
 * macOS launchd service manager for openclaw-office.
 *
 * Manages the OpenClaw Office service via launchd (user-level).
 * Commands: install, uninstall, start, stop, restart, status, log
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { execSync, exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execCb);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

const LAUNCHD_DIR = join(homedir(), "Library", "LaunchAgents");
const PLIST_NAME = "com.user.openclaw-office.plist";
const PLIST_PATH = join(LAUNCHD_DIR, PLIST_NAME);
const LABEL = "com.user.openclaw-office";
const NODE_BIN = process.execPath;
const SERVER_SCRIPT = join(__dirname, "openclaw-office.js");
const LOG_DIR = join(homedir(), "Library", "Logs", "openclaw-office");
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

function p(msg, color = "") { console.log(`${color}${msg}${C.reset}`); }
function ok(msg) { p(`  \u2713 ${msg}`, C.green); }
function err(msg) { p(`  \u2717 ${msg}`, C.red); }
function info(msg) { p(`  \u2022 ${msg}`, C.cyan); }
function warn(msg) { p(`  \u2022 ${msg}`, C.yellow); }
function dim(msg) { p(`    ${msg}`, C.gray); }

// --- Helpers ---

function launchctl(args) {
  try {
    execSync(`launchctl ${args}`, { stdio: "pipe" });
    return true;
  } catch (e) {
    return false;
  }
}

function isLoaded() {
  try {
    const out = execSync(`launchctl list | grep "${LABEL}"`, { stdio: "pipe" }).toString();
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function generatePlist(config) {
  const args = [];
  args.push(escapeXml(SERVER_SCRIPT));
  if (config.gatewayUrl) args.push(`--gateway ${escapeXml(config.gatewayUrl)}`);
  if (config.port) args.push(`--port ${config.port}`);
  if (config.host) args.push(`--host ${escapeXml(config.host)}`);
  if (config.token) args.push(`--token ${escapeXml(config.token)}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(NODE_BIN)}</string>${args.map(a => `
    <string>${a}</string>`).join("")}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(__dirname)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(STDOUT_LOG)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(STDERR_LOG)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${escapeXml(homedir())}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>`;
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
  if (!existsSync(LAUNCHD_DIR)) {
    mkdirSync(LAUNCHD_DIR, { recursive: true });
  }
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  // Unload existing service if running
  if (isLoaded()) {
    warn("Existing service found, unloading...");
    launchctl(`bootout gui/${process.getuid()}/${LABEL} 2>/dev/null || launchctl unload "${PLIST_PATH}" 2>/dev/null`);
  }

  // Write plist
  const plist = generatePlist(config);
  writeFileSync(PLIST_PATH, plist, "utf-8");
  ok(`Plist written: ${PLIST_PATH}`);

  // Load service
  const loaded = launchctl(`load "${PLIST_PATH}"`);
  if (loaded) {
    ok("Service loaded and started via launchd");
  } else {
    warn("Service plist installed but failed to load. Try:");
    dim(`launchctl load "${PLIST_PATH}"`);
    process.exitCode = 1;
  }

  p("");
  ok("OpenClaw Office service installed successfully!");
  p("");
  info(`Config: ${PLIST_PATH}`);
  info(`Stdout log: ${STDOUT_LOG}`);
  info(`Stderr log: ${STDERR_LOG}`);
  p("");
  info("The service will auto-start on login.");
  dim("To start now: openclaw-office service start");
  dim("To stop:     openclaw-office service stop");
  dim("To uninstall: openclaw-office service uninstall");
}

export function uninstall() {
  if (!existsSync(PLIST_PATH)) {
    warn("Service not installed. Nothing to do.");
    return;
  }

  if (isLoaded()) {
    info("Stopping running service...");
    launchctl(`bootout gui/${process.getuid()}/${LABEL} 2>/dev/null || launchctl unload "${PLIST_PATH}" 2>/dev/null`);
    ok("Service unloaded");
  }

  try {
    unlinkSync(PLIST_PATH);
    ok(`Plist removed: ${PLIST_PATH}`);
  } catch {
    err("Failed to remove plist file");
    process.exitCode = 1;
  }

  p("");
  ok("OpenClaw Office service uninstalled.");
}

export function start() {
  if (!existsSync(PLIST_PATH)) {
    err("Service not installed. Run: openclaw-office service install --token <token>");
    process.exit(1);
  }
  if (isLoaded()) {
    warn("Service is already running.");
    return;
  }
  const result = launchctl(`load "${PLIST_PATH}"`);
  if (result) {
    ok("Service started");
  } else {
    err("Failed to start service. Check logs:");
    dim(`cat "${STDERR_LOG}"`);
    process.exitCode = 1;
  }
}

export function stop() {
  if (!isLoaded()) {
    warn("Service is not running.");
    return;
  }
  launchctl(`bootout gui/${process.getuid()}/${LABEL} 2>/dev/null || launchctl unload "${PLIST_PATH}" 2>/dev/null`);
  ok("Service stopped");
}

export async function restart() {
  stop();
  await new Promise((r) => setTimeout(r, 500));
  start();
}

export function status() {
  if (!existsSync(PLIST_PATH)) {
    warn("Service not installed");
    p("");
    dim("Install with: openclaw-office service install --token <token>");
    return;
  }

  info(`Plist: ${PLIST_PATH}`);
  if (isLoaded()) {
    ok("Status: running");
  } else {
    err("Status: stopped");
  }

  // Show last few lines of log if exists
  if (existsSync(STDOUT_LOG)) {
    try {
      const tail = execSync(`tail -5 "${STDOUT_LOG}"`, { stdio: "pipe" }).toString();
      if (tail.trim()) {
        p("");
        info("Recent log (last 5 lines):");
        dim(tail.trim());
      }
    } catch { /* ok */ }
  }
}

export function showLogs(follow = false) {
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
  ${C.cyan}OpenClaw Office — Service Management (macOS)${C.reset}

  ${C.bold}Usage:${C.reset}
    openclaw-office service <command> [options]

  ${C.bold}Commands:${C.reset}
    install     Install as a launchd service (auto-start on login)
    uninstall   Remove the launchd service
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
