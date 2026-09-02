// Crypto primitives for the admin session backend.
//
// - ChaCha20-Poly1305 (via Web Crypto, natively supported by the Workers runtime)
//   encrypts+authenticates the session payload stored in the DB.
// - HMAC-SHA256 is used two ways:
//     1. as the MAC for the session token's "validator" half (selector/validator split
//        token pattern - see session.js), and
//     2. to compare two MACs via "double HMAC verification": instead of comparing the
//        MACs directly, both are re-HMAC'd under a fresh random key and *that* result is
//        compared. This means timing differences in the comparison can't leak anything
//        about the real MACs, because the thing being compared is re-randomized every call.
// - PBKDF2-SHA256 hashes admin passwords (bcrypt/scrypt aren't available in Workers
//   without a wasm dependency; PBKDF2 is native to Web Crypto and fine at high iteration
//   counts for a small, low-QPS admin user table).

const PBKDF2_ITERATIONS = 210_000;

function toBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Constant-time byte comparison. Only safe to use on fixed-length digests. */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function importHmacKey(secretBytes) {
  return crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export async function hmacSha256(secretBytes, messageBytes) {
  const key = await importHmacKey(secretBytes);
  const sig = await crypto.subtle.sign("HMAC", key, messageBytes);
  return new Uint8Array(sig);
}

/**
 * Double-HMAC constant-time equality check for two MACs (per OWASP guidance on
 * timing-safe MAC comparison). `secretBytes` is any server-side secret; a fresh random
 * key is generated per call so repeated comparisons of the same values never reuse it.
 */
export async function doubleHmacEqual(macA, macB) {
  const randomKey = randomBytes(32);
  const [h1, h2] = await Promise.all([
    hmacSha256(randomKey, macA),
    hmacSha256(randomKey, macB),
  ]);
  return constantTimeEqual(h1, h2);
}

// The Workers runtime's Web Crypto implementation does not actually support
// ChaCha20-Poly1305 (only AES-GCM/AES-CBC/etc - confirmed against `wrangler dev`, which
// throws NotSupportedError on `crypto.subtle.importKey`). @noble/ciphers is an audited,
// dependency-free, pure-JS implementation that runs identically in Workers, Node, and
// browsers, so it's used here instead.
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";

/**
 * Encrypts a JSON-serializable payload with ChaCha20-Poly1305.
 * Returns base64url-encoded nonce and ciphertext (ciphertext includes the Poly1305 tag).
 */
export async function encryptPayload(rawKeyBytes, payload) {
  const nonce = randomBytes(12); // 96-bit nonce, per RFC 8439
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = chacha20poly1305(rawKeyBytes, nonce).encrypt(plaintext);
  return {
    nonce: toBase64Url(nonce),
    ciphertext: toBase64Url(ciphertext),
  };
}

/** Decrypts + authenticates a payload produced by encryptPayload. Throws if the tag is invalid. */
export async function decryptPayload(rawKeyBytes, nonceB64, ciphertextB64) {
  const nonce = fromBase64Url(nonceB64);
  const ciphertext = fromBase64Url(ciphertextB64);
  const plaintext = chacha20poly1305(rawKeyBytes, nonce).decrypt(ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromBase64Url(parts[2]);
  const expectedHash = fromBase64Url(parts[3]);
  const candidateHash = await pbkdf2(password, salt, iterations);
  // Timing-safe: compare via double-HMAC rather than a raw byte comparison.
  return doubleHmacEqual(candidateHash, expectedHash);
}

async function pbkdf2(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export { toBase64Url, fromBase64Url, constantTimeEqual };
