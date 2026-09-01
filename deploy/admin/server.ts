// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Admin panel — private host bootstrap (LXC container, systemd, or Docker).
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * The portal is a static site on GitHub Pages: no request-time server, so a
 * page there cannot read `ADMIN_API_TOKEN`. The old dashboard worked around
 * that by asking the operator to paste the token and holding it in a
 * module-scoped variable for the life of the tab. That is gone. The admin
 * panel now runs here instead — on a private host, where an environment
 * variable is a real place to keep a secret.
 *
 * WHAT THIS PROCESS SERVES
 *
 *   GET  /health   liveness only; says nothing about the queue
 *   GET  /         the server-rendered moderation queue (no client JS)
 *   POST /decide   a moderation decision, as a plain form post
 *
 * The moderation handler itself (`src/modules/admin/api.ts`) is unchanged and
 * is NOT exposed on a public path. It is called in-process, and every call is
 * a real authenticated call: this bootstrap attaches `ADMIN_API_TOKEN` from
 * the environment and the handler verifies it through `requireServiceToken`,
 * whose double-HMAC comparison is constant-time. The token is read once at
 * boot, never rendered into a page, never sent to a browser, and never logged.
 *
 * FAIL CLOSED, TWICE
 *   1. At boot — the process refuses to start without a valid token, so a
 *      misconfigured unit is a dead unit rather than an open admin panel.
 *   2. Per request — the handler re-verifies on every call, so a bug here
 *      cannot turn into an unauthenticated write.
 *
 * TRUST BOUNDARY — READ BEFORE DEPLOYING
 *   Reaching this port IS being an administrator. There is no browser login:
 *   removing the paste step means the browser presents no credential at all.
 *   That is safe exactly as long as the port is private, which is why it binds
 *   to loopback unless `HOST` says otherwise. Put it behind the LXC host's
 *   firewall, a VPN, or an authenticating reverse proxy — never on 0.0.0.0
 *   with a routable address. See deploy/README.md § Admin panel.
 * ────────────────────────────────────────────────────────────────────────
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAdminApi } from "../../src/modules/admin/api";
import { createDb, DEFAULT_DATABASE_URL } from "../../src/modules/database/db";
import type { ModerationDatabase } from "../../src/modules/admin/api";
import {
  MIN_SERVICE_TOKEN_LENGTH,
  SERVICE_TOKEN_ENV,
  SERVICE_TOKEN_HEADER,
  timingSafeEqual
} from "../../src/modules/security/serviceAuth";
import { renderDashboard, type QueueRow } from "./dashboard";

const ADMIN_TOKEN_VAR = SERVICE_TOKEN_ENV.admin;

/** Refuses anything larger; a moderation form post is a few hundred bytes. */
const MAX_BODY_BYTES = 64 * 1024;

/** Notices survive the POST-redirect-GET in the query string; keep them short. */
const MAX_NOTICE_LENGTH = 200;

/* ── Boot-time configuration ─────────────────────────────────────────── */

/**
 * Folds the repository's `.env` into `process.env`, if there is one.
 *
 * Optional by design, and never authoritative: Node gives an already-set
 * variable precedence over the file, so a systemd `EnvironmentFile=` or a
 * container secret wins over a stray `.env` left in a checkout. The file is
 * the convenient path for a hand-run LXC container; neither path puts the
 * token anywhere a browser can reach.
 *
 * A missing file is not an error — a deployment that supplies the environment
 * some other way is the better configuration, not a broken one. Anything that
 * goes wrong here still lands on the config check below, which fails closed.
 */
function loadDotEnv(): void {
  const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
  try {
    process.loadEnvFile(path.resolve(envFile));
  } catch {
    // No file, or unreadable. Fall through to the real environment.
  }
}

/**
 * Reads and validates the environment before anything starts listening.
 *
 * Every failure here is fatal on purpose. An admin panel that starts in a
 * degraded state is the exact failure mode that turns a typo in a unit file
 * into an unauthenticated write endpoint.
 */
function loadConfig(env: NodeJS.ProcessEnv) {
  const problems: string[] = [];

  const adminToken = env[ADMIN_TOKEN_VAR]?.trim() ?? "";
  if (!adminToken) {
    problems.push(`${ADMIN_TOKEN_VAR} is not set. Generate one with: openssl rand -base64 32`);
  } else if (adminToken.length < MIN_SERVICE_TOKEN_LENGTH) {
    problems.push(`${ADMIN_TOKEN_VAR} is ${adminToken.length} characters; at least ${MIN_SERVICE_TOKEN_LENGTH} are required.`);
  }

  // `ADMIN_PANEL_*` first: this process shares a `.env` with the rest of the
  // repo, and a bare `PORT` there belongs to whichever module reads it next.
  const portVar = env.ADMIN_PANEL_PORT?.trim() ? "ADMIN_PANEL_PORT" : "PORT";
  const port = Number(env[portVar] ?? "8081");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`${portVar} "${env[portVar]}" is not a valid port number.`);
  }

  // Loopback by default. Binding wider is a deliberate act, not a default.
  const host = env.ADMIN_PANEL_HOST?.trim() || env.HOST?.trim() || "127.0.0.1";

  return {
    problems,
    adminToken,
    port,
    host,
    databaseUrl: env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
    databaseAuthToken: env.DATABASE_AUTH_TOKEN?.trim()
  };
}

/* ── Node ⇄ WinterCG plumbing ────────────────────────────────────────── */

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Applied to every response. `default-src 'none'` is enforceable here only
 * because the page ships no script and loads no asset — the CSP describes what
 * the dashboard actually is rather than papering over it.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; " +
    "base-uri 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  // A moderation queue is live privileged data; it must not sit in a cache.
  "cache-control": "no-store, max-age=0",
  // Robots cannot reach a private host anyway, but say it regardless.
  "x-robots-tag": "noindex, nofollow"
};

function send(res: ServerResponse, status: number, body: string, contentType: string): void {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": contentType,
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { ...SECURITY_HEADERS, location });
  res.end();
}

/* ── Request-forgery defence ─────────────────────────────────────────── */

/**
 * A per-process CSRF token, embedded in every form.
 *
 * Without a browser credential there is no session to bind to, but the panel
 * still needs this: any page the operator happens to open can POST to a
 * loopback address, and a decision endpoint that accepts such a post is a
 * one-click promotion of an attacker's submission into the trusted index.
 * A restart invalidates outstanding forms, which for a single-operator panel
 * costs one refresh.
 */
const csrfToken = crypto.randomUUID() + crypto.randomUUID();

/** Rejects a cross-site post. Absent `Origin` is treated as hostile. */
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin === "") return false;
  const host = req.headers.host;
  if (typeof host !== "string" || host === "") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/* ── Bootstrap ───────────────────────────────────────────────────────── */

loadDotEnv();

const config = loadConfig(process.env);

if (config.problems.length > 0) {
  console.error(
    "[admin] refusing to start — privileged routes must never run unauthenticated:\n" +
      config.problems.map((p) => `  ✗ ${p}`).join("\n")
  );
  process.exit(1);
}

const db = createDb({
  DATABASE_URL: config.databaseUrl,
  DATABASE_AUTH_TOKEN: config.databaseAuthToken
}) as unknown as ModerationDatabase;

const adminApi = createAdminApi({ db });

/**
 * Calls the moderation handler in-process with the environment's credential.
 *
 * The token is attached here and verified inside the handler. Nothing about
 * that check is skipped because the caller is local: the same constant-time
 * comparison runs on every call, so the panel and an external service are
 * authenticated identically.
 */
async function callAdminApi(path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`http://admin.internal${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
      [SERVICE_TOKEN_HEADER]: config.adminToken
    }
  });
  return adminApi(request, { ADMIN_API_TOKEN: config.adminToken });
}

/** Pulls the API's own error detail out of a failure response, for the operator. */
async function failureDetail(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; detail?: string } }
    | null;
  return payload?.error?.detail ?? payload?.error?.message ?? `Request failed (HTTP ${response.status}).`;
}

async function handleDashboard(url: URL, res: ServerResponse): Promise<void> {
  const response = await callAdminApi("/queue");
  if (!response.ok) {
    const detail = await failureDetail(response);
    send(
      res,
      response.status,
      renderDashboard(
        { rows: [], csrfToken, notice: { kind: "error", text: `Could not load the queue: ${detail}` } },
        { databaseUrl: config.databaseUrl }
      ),
      "text/html; charset=utf-8"
    );
    return;
  }

  const data = (await response.json()) as { count: number; submissions: QueueRow[] };
  const kind = url.searchParams.get("n") === "error" ? "error" : "ok";
  const text = url.searchParams.get("m")?.slice(0, MAX_NOTICE_LENGTH);

  send(
    res,
    200,
    renderDashboard(
      { rows: data.submissions, csrfToken, notice: text ? { kind, text } : undefined },
      { databaseUrl: config.databaseUrl }
    ),
    "text/html; charset=utf-8"
  );
}

async function handleDecide(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!originAllowed(req)) {
    send(res, 403, "Cross-site request rejected.", "text/plain; charset=utf-8");
    return;
  }

  const form = new URLSearchParams(await readBody(req));

  // Constant-time, like every other secret comparison in this codebase.
  if (!(await timingSafeEqual(form.get("csrf") ?? "", csrfToken))) {
    send(res, 403, "Stale or missing form token. Reload the dashboard and try again.", "text/plain; charset=utf-8");
    return;
  }

  const submissionId = form.get("submissionId")?.trim() ?? "";
  const action = form.get("action")?.trim() ?? "";
  const reason = form.get("reason")?.trim() ?? "";

  const response = await callAdminApi("/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submissionId, action, ...(action === "deny" ? { reason } : {}) })
  });

  const notice = new URLSearchParams();
  if (response.ok) {
    const payload = (await response.json()) as { status?: string; promotedSku?: string };
    notice.set("n", "ok");
    notice.set(
      "m",
      payload.promotedSku
        ? `Approved — promoted ${payload.promotedSku} into the core index.`
        : `Submission ${submissionId} is now ${payload.status ?? action}.`
    );
  } else {
    notice.set("n", "error");
    notice.set("m", await failureDetail(response));
  }

  // POST-redirect-GET: a refresh must not replay a moderation decision.
  redirect(res, `/?${notice.toString()}`);
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (url.pathname === "/health" && req.method === "GET") {
        // Deliberately says nothing about the queue: whether a moderation
        // backlog exists is not something a liveness probe should disclose.
        send(res, 200, JSON.stringify({ status: "ok", service: "admin-panel" }), "application/json; charset=utf-8");
        return;
      }

      if (url.pathname === "/" && req.method === "GET") {
        await handleDashboard(url, res);
        return;
      }

      if (url.pathname === "/decide" && req.method === "POST") {
        await handleDecide(req, res);
        return;
      }

      send(res, 404, "Not found.", "text/plain; charset=utf-8");
    } catch (err) {
      // Never echo an exception to the browser — a stack trace from this
      // process can name the database path and the environment around it.
      console.error("[admin] request failed:", err);
      if (!res.headersSent) send(res, 500, "Internal error.", "text/plain; charset=utf-8");
      else res.end();
    }
  })();
});

server.listen(config.port, config.host, () => {
  console.log(`[admin] panel listening on http://${config.host}:${config.port}`);
  console.log(`[admin] staging database: ${config.databaseUrl}`);
  console.log(`[admin] ${ADMIN_TOKEN_VAR} loaded from the environment (${config.adminToken.length} chars, never logged)`);
  if (config.host !== "127.0.0.1" && config.host !== "localhost" && config.host !== "::1") {
    console.warn(
      `[admin] WARNING: bound to ${config.host}, not loopback. This panel has no browser login — ` +
        `anyone who can reach this port is an administrator. Restrict it at the firewall or proxy.`
    );
  }
});

// systemd sends SIGTERM on `stop` and on `restart`; close cleanly so an
// in-flight decision is not cut off mid-write.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`[admin] ${signal} received; shutting down.`);
    server.close(() => process.exit(0));
  });
}
