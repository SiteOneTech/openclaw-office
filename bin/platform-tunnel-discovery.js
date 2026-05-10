import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sanitizeIdPart(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
}

function splitCommandLine(commandLine) {
  return String(commandLine || "").match(/"[^"]*"|'[^']*'|\S+/gu)?.map((token) => {
    if (
      (token.startsWith("\"") && token.endsWith("\"")) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1);
    }
    return token;
  }) ?? [];
}

export function parseForwardSpec(spec) {
  const parts = String(spec || "").split(":");
  if (parts.length === 3) {
    const [localPort, remoteHost, remotePort] = parts;
    return {
      localHost: "127.0.0.1",
      localPort: Number(localPort),
      remoteHost,
      remotePort: Number(remotePort),
    };
  }
  if (parts.length === 4) {
    const [localHost, localPort, remoteHost, remotePort] = parts;
    return {
      localHost: localHost || "127.0.0.1",
      localPort: Number(localPort),
      remoteHost,
      remotePort: Number(remotePort),
    };
  }
  return null;
}

export function extractForwardTunnels(pid, commandLine) {
  const tokens = splitCommandLine(commandLine);
  const tunnels = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const spec = token === "-L" ? tokens[i + 1] : token.startsWith("-L") ? token.slice(2) : "";
    if (!spec) {
      continue;
    }
    const forward = parseForwardSpec(spec);
    if (
      !forward ||
      !Number.isInteger(forward.localPort) ||
      !Number.isInteger(forward.remotePort) ||
      forward.localPort <= 0 ||
      forward.remotePort <= 0
    ) {
      continue;
    }
    const id = [
      "detected",
      sanitizeIdPart(forward.localHost),
      forward.localPort,
      sanitizeIdPart(forward.remoteHost),
      forward.remotePort,
    ].filter(Boolean).join("-");
    tunnels.push({
      id,
      label: `Detected tunnel :${forward.localPort}`,
      description: "Detected from the local process table. It is shown for monitoring only.",
      kind: "detected-local",
      localHost: forward.localHost,
      localPort: forward.localPort,
      remoteHost: forward.remoteHost,
      remotePort: forward.remotePort,
      url: `http://${forward.localHost}:${forward.localPort}`,
      autostart: false,
      tags: ["detected", "local"],
      source: "shell",
      pid,
    });
  }
  return tunnels;
}

export async function discoverShellTunnels() {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,args="], {
      timeout: 2500,
      maxBuffer: 1024 * 1024,
    });
    const byId = new Map();
    for (const line of stdout.split(/\r?\n/u)) {
      const match = /^\s*(\d+)\s+(.+)$/u.exec(line);
      if (!match) {
        continue;
      }
      const pid = Number(match[1]);
      const commandLine = match[2];
      if (!commandLine.includes("-L") || !/(^|\s)(ssh|gcloud)(\s|$)/u.test(commandLine)) {
        continue;
      }
      for (const tunnel of extractForwardTunnels(pid, commandLine)) {
        byId.set(tunnel.id, tunnel);
      }
    }
    return [...byId.values()].sort((a, b) => a.localPort - b.localPort || a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}
