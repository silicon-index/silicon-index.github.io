// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tier-2 authentication: per-module service tokens.
 *
 * The two tiers protect different things and must not be confused:
 *
 *   Tier 1 — public, stateless, short-lived (`contributors/auth.ts`).
 *            Issued to any browser. Proves integrity and bounds a replay
 *            window. It is a speed bump, NOT authentication.
 *
 *   Tier 2 — this file. A long-lived shared secret per module, supplied by the
 *            operator through the environment and presented on privileged,
 *            module-to-module calls. This IS authentication, so it is held to
 *            a higher standard: fail-closed, constant-time, scoped per module.
 *
 * WinterCG only — `crypto.subtle`, `Request`, `Response`. No `node:*`, no
 * dependency, so the same middleware runs in a container and on the edge.
 *
 * WHAT THIS IS NOT
 *   A bearer token is only as good as its transport and its storage. It gives
 *   no per-caller identity, no rotation, and no revocation beyond changing the
 *   value. Over plain HTTP it is trivially captured. Treat it as a service
 *   credential between trusted components, not as a user auth system, and
 *   terminate TLS in front of it.
 */

const encoder = new TextEncoder();

/** Minimum length for a service token worth trusting. */
export const MIN_SERVICE_TOKEN_LENGTH = 24;

/** Header carrying the service credential. */
export const SERVICE_TOKEN_HEADER = "x-service-token";

/** Env var names, one per module — a token opens one module, never all of them. */
export const SERVICE_TOKEN_ENV = {
  database: "DATABASE_API_TOKEN",
  admin: "ADMIN_API_TOKEN",
  ai: "AI_API_TOKEN",
  scrapers: "SCRAPERS_API_TOKEN",
  contributors: "CONTRIBUTORS_API_TOKEN"
} as const;

export type ServiceModule = keyof typeof SERVICE_TOKEN_ENV;

export type ServiceAuthFailure =
  | "not_configured"
  | "weak_secret"
  | "missing_credential"
  | "invalid_credential";

export type ServiceAuthResult =
  | { authorized: true; module: ServiceModule }
  | { authorized: false; reason: ServiceAuthFailure; detail: string };

/**
 * Constant-time string equality.
 *
 * Both values are HMAC'd under a per-call random key and the fixed-length
 * digests are compared. A plain `===` on a secret leaks its prefix through
 * timing, and it also leaks the expected length. Web Crypto has no
 * `timingSafeEqual`, so this double-HMAC construction is the portable way to
 * get the same property.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const [digestA, digestB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b))
  ]);

  const viewA = new Uint8Array(digestA);
  const viewB = new Uint8Array(digestB);
  let difference = 0;
  for (let i = 0; i < viewA.length; i += 1) difference |= viewA[i] ^ viewB[i];
  return difference === 0;
}

function readCredential(request: Request): string | null {
  const header = request.headers.get(SERVICE_TOKEN_HEADER);
  if (header) return header.trim();

  // Also accept `Authorization: Bearer <token>`, which is what most callers
  // and proxies expect to send.
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();

  return null;
}

/**
 * Authenticates a privileged call against one module's token.
 *
 * FAILS CLOSED. An unset or too-short secret denies the request rather than
 * waving it through: a misconfigured deployment must not silently become an
 * open write endpoint, which is the failure mode that turns a config slip into
 * a data breach.
 */
export async function authenticateService(
  request: Request,
  env: Record<string, string | undefined>,
  module: ServiceModule
): Promise<ServiceAuthResult> {
  const variable = SERVICE_TOKEN_ENV[module];
  const expected = env[variable]?.trim();

  if (!expected) {
    return {
      authorized: false,
      reason: "not_configured",
      detail: `${variable} is not set. Privileged ${module} routes are disabled until it is.`
    };
  }
  if (expected.length < MIN_SERVICE_TOKEN_LENGTH) {
    return {
      authorized: false,
      reason: "weak_secret",
      detail: `${variable} must be at least ${MIN_SERVICE_TOKEN_LENGTH} characters.`
    };
  }

  const supplied = readCredential(request);
  if (!supplied) {
    return {
      authorized: false,
      reason: "missing_credential",
      detail: `Send the module token in "${SERVICE_TOKEN_HEADER}" or as a bearer token.`
    };
  }

  // Compared in constant time, and only ever against THIS module's secret —
  // a database token must not open an admin route.
  if (!(await timingSafeEqual(supplied, expected))) {
    return { authorized: false, reason: "invalid_credential", detail: "Service token is not valid for this module." };
  }

  return { authorized: true, module };
}

/**
 * Guard for a privileged route.
 * Returns a `Response` to short-circuit with, or `null` when authorized.
 */
export async function requireServiceToken(
  request: Request,
  env: Record<string, string | undefined>,
  module: ServiceModule
): Promise<Response | null> {
  const result = await authenticateService(request, env, module);
  if (result.authorized) return null;

  // A misconfigured server is 503 (our fault); a bad or absent credential is
  // 401 (the caller's). Conflating them would tell an attacker which is which
  // only in the first case, which is the safe direction.
  const status = result.reason === "not_configured" || result.reason === "weak_secret" ? 503 : 401;

  return new Response(
    JSON.stringify({
      error: {
        status,
        message: status === 503 ? "Privileged routes unavailable" : "Service authentication required",
        // The detail never echoes the supplied credential.
        detail: result.detail
      }
    }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(status === 401 ? { "www-authenticate": `Bearer realm="${module}"` } : {})
      }
    }
  );
}
