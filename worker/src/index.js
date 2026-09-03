// Silicon Index admin API - a standalone Cloudflare Worker.
//
// Deployed independently of the static site (silicon-index.github.io, which is
// GitHub Pages and can't run server code). The admin UI at /admin/ on the static site
// calls this Worker cross-origin with `credentials: "include"`.
//
// No token ever touches localStorage/sessionStorage/JS-readable storage: the session
// handle lives only in an HttpOnly cookie, and the session itself lives in the DB
// (D1 or LibSQL - see db.js) with a server-side expiry. See session.js for the crypto.

import { createDb } from "./db.js";
import { createSession, verifySession, destroySession, purgeExpiredSessions } from "./session.js";
import { verifyPassword, hashPassword } from "./crypto.js";

const SESSION_COOKIE = "si_session";

function corsHeaders(env, request) {
  const origin = request.headers.get("Origin");
  const allowed = origin && origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(data, init, env, request) {
  const headers = { "Content-Type": "application/json", ...corsHeaders(env, request), ...(init?.headers || {}) };
  return new Response(JSON.stringify(data), { ...init, headers });
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// Browsers refuse to store a `Secure` cookie on a plain-HTTP response, and refuse
// `SameSite=None` at all without `Secure`. In production this Worker only ever sees
// HTTPS (Cloudflare terminates TLS), where the admin UI and this API are on genuinely
// different sites, so Secure + SameSite=None is required. For local/LAN HTTP testing
// (e.g. http://<lan-ip>:8090 talking to http://<lan-ip>:8787), we drop Secure and use
// SameSite=Lax instead - same registrable host, different port, is "same-site" per the
// cookie spec, so Lax still sends the cookie on the admin UI's cross-origin fetches.
function cookieAttributes(request) {
  const isHttps = new URL(request.url).protocol === "https:";
  return isHttps ? "HttpOnly; Secure; SameSite=None" : "HttpOnly; SameSite=Lax";
}

function sessionCookieHeader(request, token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; ${cookieAttributes(request)}; Max-Age=${maxAgeSeconds}`;
}

function expireCookieHeader(request) {
  return `${SESSION_COOKIE}=; Path=/; ${cookieAttributes(request)}; Max-Age=0`;
}

/**
 * Cross-site cookies (SameSite=None, required since the admin UI and this Worker are on
 * different origins) can be attached by any site's forms/fetches. Since the browser will
 * happily send the cookie on a request forged from another origin, state-changing routes
 * must independently confirm the request actually originated from the admin UI.
 */
function originIsAllowed(request, env) {
  const origin = request.headers.get("Origin");
  return origin === env.ALLOWED_ORIGIN;
}

async function requireSession(request, env, db) {
  const token = readCookie(request, SESSION_COOKIE);
  return verifySession(env, db, token);
}

async function handleLogin(request, env, db) {
  if (!originIsAllowed(request, env)) {
    return json({ error: "Forbidden origin" }, { status: 403 }, env, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 }, env, request);
  }
  const { identifier, password } = body || {};
  if (typeof identifier !== "string" || typeof password !== "string" || !identifier || !password) {
    return json({ error: "identifier and password are required" }, { status: 400 }, env, request);
  }

  const user = await db.get(
    `SELECT id, username, password_hash, role FROM users WHERE username = ? OR email = ?`,
    [identifier, identifier]
  );

  // Always run verifyPassword, even on a missing user, against a fixed dummy hash so
  // login timing doesn't reveal whether the username exists.
  const dummyHash = "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const passwordOk = await verifyPassword(password, user ? user.password_hash : dummyHash);

  if (!user || !passwordOk) {
    return json({ error: "Invalid credentials" }, { status: 401 }, env, request);
  }

  await purgeExpiredSessions(db);

  const { token, expiresAt } = await createSession(env, db, {
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  const maxAge = expiresAt - Math.floor(Date.now() / 1000);
  return json(
    { username: user.username, role: user.role },
    { status: 200, headers: { "Set-Cookie": sessionCookieHeader(request, token, maxAge) } },
    env,
    request
  );
}

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleRegister(request, env, db) {
  if (!originIsAllowed(request, env)) {
    return json({ error: "Forbidden origin" }, { status: 403 }, env, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 }, env, request);
  }
  const { username, email, password } = body || {};

  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return json(
      { error: "Username must be 3-32 characters (letters, numbers, _ or -)" },
      { status: 400 },
      env,
      request
    );
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return json({ error: "A valid email is required" }, { status: 400 }, env, request);
  }
  if (typeof password !== "string" || password.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, { status: 400 }, env, request);
  }

  const existing = await db.get(`SELECT id FROM users WHERE username = ? OR email = ?`, [username, email]);
  if (existing) {
    return json({ error: "Username or email is already registered" }, { status: 409 }, env, request);
  }

  // `role` is never taken from the request body - every self-registered account is
  // 'user'. Admin accounts are only ever created out-of-band (see worker/README.md).
  const passwordHash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  const result = await db.run(
    `INSERT INTO users (username, email, password_hash, role, created_at) VALUES (?, ?, ?, 'user', ?)`,
    [username, email, passwordHash, now]
  );

  await purgeExpiredSessions(db);

  const { token, expiresAt } = await createSession(env, db, {
    userId: result.lastRowId,
    username,
    role: "user",
  });

  const maxAge = expiresAt - Math.floor(Date.now() / 1000);
  return json(
    { username, role: "user" },
    { status: 201, headers: { "Set-Cookie": sessionCookieHeader(request, token, maxAge) } },
    env,
    request
  );
}

async function handleLogout(request, env, db) {
  const token = readCookie(request, SESSION_COOKIE);
  await destroySession(db, token);
  return json({ ok: true }, { status: 200, headers: { "Set-Cookie": expireCookieHeader(request) } }, env, request);
}

async function handleMe(request, env, db) {
  const session = await requireSession(request, env, db);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 }, env, request);
  return json({ username: session.username, role: session.role }, { status: 200 }, env, request);
}

async function handleListSubmissions(request, env, db) {
  const session = await requireSession(request, env, db);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 }, env, request);
  if (session.role !== "admin") return json({ error: "Forbidden" }, { status: 403 }, env, request);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";
  if (!["pending", "approved", "rejected"].includes(status)) {
    return json({ error: "Invalid status filter" }, { status: 400 }, env, request);
  }

  const rows = await db.all(
    `SELECT s.id, s.component_id, s.price_amount, s.currency, s.submitted_by, s.status,
            s.created_at, s.reviewed_at, u.username AS reviewed_by
     FROM submissions s
     LEFT JOIN users u ON u.id = s.reviewed_by
     WHERE s.status = ? ORDER BY s.created_at DESC LIMIT 200`,
    [status]
  );
  return json({ submissions: rows }, { status: 200 }, env, request);
}

async function handleReviewSubmission(request, env, db, id, decision) {
  if (!originIsAllowed(request, env)) {
    return json({ error: "Forbidden origin" }, { status: 403 }, env, request);
  }
  const session = await requireSession(request, env, db);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 }, env, request);
  if (session.role !== "admin") return json({ error: "Forbidden" }, { status: 403 }, env, request);

  const submissionId = Number(id);
  if (!Number.isInteger(submissionId)) {
    return json({ error: "Invalid submission id" }, { status: 400 }, env, request);
  }

  const status = decision === "approve" ? "approved" : "rejected";
  const now = Math.floor(Date.now() / 1000);
  const result = await db.run(
    `UPDATE submissions SET status = ?, reviewed_by = ?, reviewed_at = ?
     WHERE id = ? AND status = 'pending'`,
    [status, session.userId, now, submissionId]
  );

  if (!result.changes) {
    return json({ error: "Submission not found or already reviewed" }, { status: 404 }, env, request);
  }
  return json({ ok: true, id: submissionId, status }, { status: 200 }, env, request);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    const db = createDb(env);
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/register" && request.method === "POST") return handleRegister(request, env, db);
      if (path === "/api/login" && request.method === "POST") return handleLogin(request, env, db);
      if (path === "/api/logout" && request.method === "POST") return handleLogout(request, env, db);
      if (path === "/api/me" && request.method === "GET") return handleMe(request, env, db);
      if (path === "/api/submissions" && request.method === "GET") return handleListSubmissions(request, env, db);

      const reviewMatch = path.match(/^\/api\/submissions\/(\d+)\/(approve|reject)$/);
      if (reviewMatch && request.method === "POST") {
        return handleReviewSubmission(request, env, db, reviewMatch[1], reviewMatch[2]);
      }

      return json({ error: "Not found" }, { status: 404 }, env, request);
    } catch (err) {
      console.error(err);
      return json({ error: "Internal error" }, { status: 500 }, env, request);
    }
  },

  async scheduled(_event, env) {
    const db = createDb(env);
    await purgeExpiredSessions(db);
  },
};
