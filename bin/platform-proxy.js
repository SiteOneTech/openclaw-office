import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const PLATFORM_PROXY_PREFIX = "/api/platform";
const DEFAULT_PLATFORM_BASE_URL = "http://127.0.0.1:18790";

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(body);
}

function readRawRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function resolvePlatformApiBase() {
  return String(
    process.env.OPENCLAW_PLATFORM_BASE_URL ||
      process.env.PLATFORM_BASE_URL ||
      DEFAULT_PLATFORM_BASE_URL,
  ).trim().replace(/\/+$/u, "");
}

function platformApiPath(pathname, search = "") {
  if (pathname !== PLATFORM_PROXY_PREFIX && !pathname.startsWith(`${PLATFORM_PROXY_PREFIX}/`)) {
    return "";
  }
  const upstreamPath = pathname.slice(PLATFORM_PROXY_PREFIX.length) || "/";
  return `${upstreamPath}${search}`;
}

function sameOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function platformCorsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !sameOriginAllowed(req)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export async function handlePlatformApiProxy(req, res, pathname, search = "") {
  if (!sameOriginAllowed(req)) {
    sendJson(res, 403, { ok: false, error: "Cross-origin platform request rejected" });
    return true;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, platformCorsHeaders(req));
    res.end();
    return true;
  }

  if (!["GET", "POST"].includes(req.method || "")) {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return true;
  }

  const upstreamPath = platformApiPath(pathname, search);
  if (!upstreamPath) {
    return false;
  }

  const baseUrl = resolvePlatformApiBase();
  if (!baseUrl) {
    sendJson(res, 503, { ok: false, error: "Platform Service proxy is not configured" });
    return true;
  }

  const upstreamUrl = new URL(upstreamPath, `${baseUrl}/`);
  const payload = req.method === "GET" ? Buffer.alloc(0) : await readRawRequestBody(req);
  const headers = { Accept: "application/json" };
  const contentType = req.headers["content-type"];
  if (payload.length > 0) {
    headers["Content-Type"] = Array.isArray(contentType)
      ? contentType[0]
      : contentType || "application/json; charset=utf-8";
    headers["Content-Length"] = String(payload.length);
  }

  const doRequest = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
  await new Promise((resolve) => {
    const upstreamReq = doRequest(
      upstreamUrl,
      { method: req.method, headers, timeout: 15000 },
      (upstreamRes) => {
        const chunks = [];
        upstreamRes.on("data", (chunk) => chunks.push(chunk));
        upstreamRes.on("end", () => {
          const body = Buffer.concat(chunks);
          res.writeHead(upstreamRes.statusCode || 502, {
            "Content-Type": upstreamRes.headers["content-type"] || "application/json; charset=utf-8",
            ...platformCorsHeaders(req),
          });
          res.end(body);
          resolve();
        });
      },
    );

    upstreamReq.on("timeout", () => {
      upstreamReq.destroy(new Error("platform service timeout"));
    });
    upstreamReq.on("error", (err) => {
      sendJson(res, 502, { ok: false, error: String(err.message || err) });
      resolve();
    });
    if (payload.length > 0) {
      upstreamReq.write(payload);
    }
    upstreamReq.end();
  });
  return true;
}
