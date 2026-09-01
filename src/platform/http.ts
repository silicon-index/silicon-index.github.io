// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Runtime-agnostic HTTP helpers for the headless module APIs.
 *
 * WinterCG only: `Request`, `Response`, `URL`, `fetch`. No `node:*` imports,
 * no DOM, no framework — so the same code runs unchanged on Node, Bun,
 * Deno, and Cloudflare Workers.
 *
 * This is the one shared runtime dependency of each module's `api.ts`. When a
 * module is split into its own repository, vendor this file with it (or
 * publish it as a small internal package) — it imports nothing, so the move
 * is a copy.
 */

export interface ApiEnv {
  /** Upstream market data. Defaults to the market-database repo's `dev` branch. */
  MARKET_DATA_URL?: string;
  /** Comma-separated allowed origins, or `*`. Defaults to `*`. */
  ALLOWED_ORIGINS?: string;
}

export interface ApiError {
  error: { status: number; message: string; detail?: string };
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

/** Resolves the CORS origin header value for a request. */
function corsOrigin(request: Request, env: ApiEnv): string {
  const configured = (env.ALLOWED_ORIGINS ?? "*").trim();
  if (configured === "*") return "*";
  const origin = request.headers.get("origin");
  const allowed = configured.split(",").map((o) => o.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : allowed[0] ?? "*";
}

/**
 * These APIs serve public, read-only market data and pure computation, so a
 * permissive origin policy is appropriate. Credentials are never accepted —
 * anything that mutates state must add authentication before being exposed.
 */
export function corsHeaders(request: Request, env: ApiEnv): Record<string, string> {
  return {
    "access-control-allow-origin": corsOrigin(request, env),
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) }
  });
}

export function fail(status: number, message: string, detail?: string): Response {
  const body: ApiError = { error: { status, message, ...(detail ? { detail } : {}) } };
  return json(body, { status });
}

export const notFound = (path: string) => fail(404, "Not found", `No route for ${path}`);

export function methodNotAllowed(allowed: string[]): Response {
  return json({ error: { status: 405, message: "Method not allowed" } }, {
    status: 405,
    headers: { allow: allowed.join(", ") }
  });
}

/** Parses a JSON body, returning a 400 Response instead of throwing. */
export async function readJson<T>(request: Request): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false, response: fail(415, "Unsupported media type", "Expected application/json") };
  }
  try {
    return { ok: true, value: (await request.json()) as T };
  } catch (err) {
    return { ok: false, response: fail(400, "Invalid JSON body", (err as Error).message) };
  }
}

/**
 * Wraps a handler with CORS, preflight handling, and a last-resort error
 * boundary so an unexpected throw returns JSON rather than a runtime-specific
 * HTML error page.
 */
export function withApiMiddleware(
  handler: (request: Request, env: ApiEnv) => Promise<Response> | Response
): (request: Request, env?: ApiEnv) => Promise<Response> {
  return async (request: Request, env: ApiEnv = {}) => {
    const headers = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    let response: Response;
    try {
      response = await handler(request, env);
    } catch (err) {
      response = fail(500, "Internal error", (err as Error).message);
    }

    const merged = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) merged.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
  };
}
