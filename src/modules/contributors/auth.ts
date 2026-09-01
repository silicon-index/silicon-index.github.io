// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Contributors — stateless submission tokens.
 *
 * A short-lived HMAC-SHA256 token issued to the contribute page and required
 * by the submission endpoint. Built entirely on Web Crypto (`crypto.subtle`),
 * so it runs unchanged on Cloudflare Workers, Bun, Deno and Node ≥18 — no
 * `node:crypto`, no polyfill, no dependency.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES AND DOES NOT PREVENT — read before relying on it
 *
 *   ✓ Raises the cost of trivial automation: a bot must make two requests and
 *     handle a signed value rather than blindly POSTing.
 *   ✓ Bounds how long a captured token stays useful (default 15 minutes).
 *   ✓ Verifies integrity — a payload cannot be edited without the secret.
 *
 *   ✗ It does NOT prevent replay. A token is a bearer credential with no
 *     server-side state, so the same one can be submitted repeatedly until it
 *     expires. Genuine replay protection needs the `jti` recorded and checked
 *     against a store (D1/LibSQL row, or a KV entry with the token's TTL) —
 *     `extractJti` exists for exactly that, but nothing consumes it yet.
 *   ✗ It does NOT stop a determined spammer. The issuing endpoint is public
 *     and unauthenticated by design, so a bot can simply fetch a fresh token
 *     per submission. Real defence is rate limiting at the edge, and
 *     moderation — which the staging airgap already guarantees.
 *
 * Treat this as a speed bump plus an integrity check, not as authentication.
 * ────────────────────────────────────────────────────────────────────────
 */

/** Default lifetime. Short enough to bound replay, long enough to fill a form. */
export const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60;

/** Tolerance for clock skew between issuer and verifier. */
const CLOCK_SKEW_SECONDS = 60;

/** Rejects a secret too short to be worth signing with. */
const MIN_SECRET_LENGTH = 32;

export interface TokenPayload {
  /** Issued at, unix seconds. */
  iat: number;
  /** Expires at, unix seconds. */
  exp: number;
  /** Random token id. The hook for replay protection once a store exists. */
  jti: string;
  /** Purpose, so a token minted for one route cannot be spent on another. */
  aud: string;
}

export type TokenFailure =
  | "missing"
  | "malformed"
  | "bad_signature"
  | "expired"
  | "not_yet_valid"
  | "wrong_audience";

export type TokenVerification =
  | { valid: true; payload: TokenPayload }
  | { valid: false; reason: TokenFailure; detail: string };

/* ------------------------------------------------------------------ */
/* base64url — no Buffer, no atob edge cases                           */
/* ------------------------------------------------------------------ */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* ------------------------------------------------------------------ */
/* Signing                                                             */
/* ------------------------------------------------------------------ */

async function importKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    // Fail closed and loudly. A weak or absent secret makes every token
    // forgeable, which is worse than having no token check at all because it
    // looks protected.
    throw new Error(
      `Submission token secret must be at least ${MIN_SECRET_LENGTH} characters. ` +
        `Set CONTRIBUTE_TOKEN_SECRET to a long random value.`
    );
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Issues a signed, short-lived token. Requires no storage. */
export async function issueToken(
  secret: string,
  options: { ttlSeconds?: number; audience?: string; now?: number } = {}
): Promise<string> {
  const key = await importKey(secret);
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const jtiBytes = crypto.getRandomValues(new Uint8Array(16));

  const payload: TokenPayload = {
    iat: nowSeconds,
    exp: nowSeconds + (options.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS),
    jti: bytesToBase64Url(jtiBytes),
    aud: options.audience ?? "contribute"
  };

  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifies signature, audience and expiry. No database lookup.
 *
 * The signature is checked with `crypto.subtle.verify` rather than by
 * comparing strings, so the comparison is constant-time and does not leak the
 * expected MAC through timing.
 */
export async function verifyToken(
  secret: string,
  token: string | null | undefined,
  options: { audience?: string; now?: number } = {}
): Promise<TokenVerification> {
  if (!token) return { valid: false, reason: "missing", detail: "No submission token supplied." };

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: "malformed", detail: "Token must be <payload>.<signature>." };
  }
  const [body, signature] = parts;

  const key = await importKey(secret);

  let signatureValid: boolean;
  try {
    signatureValid = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), encoder.encode(body));
  } catch {
    return { valid: false, reason: "malformed", detail: "Signature is not valid base64url." };
  }
  // Checked before parsing: never interpret a payload whose integrity is unproven.
  if (!signatureValid) {
    return { valid: false, reason: "bad_signature", detail: "Signature does not match." };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(body))) as TokenPayload;
  } catch {
    return { valid: false, reason: "malformed", detail: "Payload is not valid JSON." };
  }

  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    return { valid: false, reason: "malformed", detail: "Payload is missing iat/exp." };
  }

  const expectedAudience = options.audience ?? "contribute";
  if (payload.aud !== expectedAudience) {
    return { valid: false, reason: "wrong_audience", detail: `Token is for "${payload.aud}".` };
  }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (nowSeconds > payload.exp + CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: "expired", detail: "Token has expired; reload the form." };
  }
  if (payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: "not_yet_valid", detail: "Token is issued in the future." };
  }

  return { valid: true, payload };
}

/**
 * The token's unique id, for a future replay store.
 *
 * Returns null unless the token verifies — an unverified `jti` is attacker
 * controlled and must never be trusted as a key.
 */
export async function extractJti(secret: string, token: string): Promise<string | null> {
  const result = await verifyToken(secret, token);
  return result.valid ? result.payload.jti : null;
}
