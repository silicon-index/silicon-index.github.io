#!/usr/bin/env node
// Generates a PBKDF2 password hash in the same format src/crypto.js verifies, for
// seeding/rotating users.password_hash. Never store a plaintext password.
//
// Usage:
//   node scripts/hash-password.mjs <password>
//   node scripts/hash-password.mjs            (prompts, input hidden)
//
// Then seed/update the row, e.g. (role must be 'admin' explicitly - self-registration
// via POST /api/register can only ever create 'user' rows):
//   wrangler d1 execute silicon-index-admin --command \
//     "INSERT INTO users (username, email, password_hash, role, created_at) \
//      VALUES ('admin', 'admin@example.com', '<printed hash>', 'admin', unixepoch())"

import { webcrypto as crypto } from "node:crypto";
import readline from "node:readline";

const PBKDF2_ITERATIONS = 210_000;

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function pbkdf2(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, keyMaterial, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // eslint-disable-next-line no-underscore-dangle
    rl._writeToOutput = () => {};
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const arg = process.argv[2];
const password = arg || (await promptHidden("Password to hash: "));
if (!password) {
  console.error("No password provided.");
  process.exit(1);
}

console.log(await hashPassword(password));
