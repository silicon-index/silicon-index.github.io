// Database-backed ephemeral sessions.
//
// The cookie value is a "selector.validator" split token (same pattern used by
// Django's/Symfony's remember-me tokens and paragonie's split-token guidance):
//   - selector:  16 random bytes, base64url. Low-entropy-safe - it's only a DB lookup
//                key, never treated as a secret.
//   - validator: 32 random bytes, base64url. The actual secret. Only its HMAC is ever
//                stored in the DB, so a stolen DB snapshot alone can't forge a session.
//
// On each request we look the row up by selector (cheap, not secret), then confirm the
// caller actually holds the validator via a double-HMAC constant-time comparison against
// the stored MAC. The row's payload (user id/username/role) is ChaCha20-Poly1305
// encrypted at rest, so a DB leak alone leaks neither identities nor forgeable sessions.

import { randomBytes, hmacSha256, doubleHmacEqual, encryptPayload, decryptPayload, toBase64Url, fromBase64Url } from "./crypto.js";

const SELECTOR_BYTES = 16;
const VALIDATOR_BYTES = 32;

function hmacSecretBytes(env) {
  const secret = env.SESSION_HMAC_SECRET;
  if (!secret) throw new Error("SESSION_HMAC_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

function encKeyBytes(env) {
  const key = env.SESSION_ENC_KEY;
  if (!key) throw new Error("SESSION_ENC_KEY is not configured");
  const raw = fromBase64Url(key);
  if (raw.length !== 32) throw new Error("SESSION_ENC_KEY must decode to exactly 32 bytes");
  return raw;
}

function ttlSeconds(env) {
  return parseInt(env.SESSION_TTL_SECONDS || "43200", 10); // default 12h
}

export async function createSession(env, db, userPayload) {
  const selector = toBase64Url(randomBytes(SELECTOR_BYTES));
  const validator = toBase64Url(randomBytes(VALIDATOR_BYTES));

  const validatorMac = toBase64Url(await hmacSha256(hmacSecretBytes(env), new TextEncoder().encode(validator)));
  const { nonce, ciphertext } = await encryptPayload(encKeyBytes(env), userPayload);

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds(env);

  await db.run(
    `INSERT INTO sessions (selector, validator_mac, nonce, ciphertext, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [selector, validatorMac, nonce, ciphertext, now, expiresAt]
  );

  return { token: `${selector}.${validator}`, expiresAt };
}

/** Returns the decrypted session payload, or null if the token is missing/invalid/expired. */
export async function verifySession(env, db, token) {
  if (!token || !token.includes(".")) return null;
  const [selector, validator] = token.split(".");
  if (!selector || !validator) return null;

  const row = await db.get(
    `SELECT selector, validator_mac, nonce, ciphertext, expires_at FROM sessions WHERE selector = ?`,
    [selector]
  );
  if (!row) return null;

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) {
    // Expired - clean up lazily and reject.
    await db.run(`DELETE FROM sessions WHERE selector = ?`, [selector]);
    return null;
  }

  const candidateMac = await hmacSha256(hmacSecretBytes(env), new TextEncoder().encode(validator));
  const storedMac = fromBase64Url(row.validator_mac);
  const valid = await doubleHmacEqual(candidateMac, storedMac);
  if (!valid) return null;

  try {
    return await decryptPayload(encKeyBytes(env), row.nonce, row.ciphertext);
  } catch {
    // Tampered ciphertext/tag mismatch - treat as invalid rather than throwing.
    return null;
  }
}

export async function destroySession(db, token) {
  if (!token || !token.includes(".")) return;
  const [selector] = token.split(".");
  if (!selector) return;
  await db.run(`DELETE FROM sessions WHERE selector = ?`, [selector]);
}

/** Opportunistic cleanup; safe to call from a cron trigger or inline on login. */
export async function purgeExpiredSessions(db) {
  const now = Math.floor(Date.now() / 1000);
  await db.run(`DELETE FROM sessions WHERE expires_at < ?`, [now]);
}
