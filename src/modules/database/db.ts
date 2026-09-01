// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Market Database — LibSQL connection wrapper (container / Node / Bun).
 *
 * ────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE IMPORTING FROM A WORKER OR A BROWSER BUNDLE
 *
 * `@libsql/client` is a **Node-targeted** package: its default entry pulls in
 * `node:*` builtins for local `file:` databases. Importing this module from a
 * Cloudflare Worker or from client-side code breaks the WinterCG guarantee the
 * rest of this codebase maintains.
 *
 * LibSQL also does **not** speak Cloudflare D1. D1 is reached through a Worker
 * binding and Drizzle's separate `drizzle-orm/d1` driver — see `db.d1.ts`.
 * The portability comes from the shared SQLite **schema and queries**, not
 * from a single client: `schema.ts` is identical for both targets, so the same
 * Drizzle query code runs against either.
 *
 *   container / Coolify / Fly  →  this file        (`drizzle-orm/libsql`)
 *   Cloudflare Workers          →  `db.d1.ts`      (`drizzle-orm/d1`)
 *
 * `scripts/check-architecture.mjs` fails the build if a page, component, or
 * WinterCG `api.ts` imports either one.
 * ────────────────────────────────────────────────────────────────────────
 */

import { createClient, type Client, type Config } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import { coreSchema } from "./schema/core";
import { stagingSchema } from "./schema/staging";

/**
 * The full schema, for migrations and for the moderation path that legitimately
 * spans both halves. Public write handlers must NOT take this — they import
 * `schema/staging.ts` directly, so a core table is not nameable in that file.
 */
export const schema = { ...coreSchema, ...stagingSchema };

export type Database = LibSQLDatabase<typeof schema>;

/** Local file used when nothing is configured — fine for a container volume. */
export const DEFAULT_DATABASE_URL = "file:local.db";

/**
 * Environment a connection can be built from.
 *
 * Passed in rather than read from `process.env`, so this stays usable wherever
 * env arrives as an argument (Workers, tests) instead of a global.
 */
export interface DatabaseEnv {
  /** `file:local.db`, or a `libsql://…` / `https://…` Turso URL. */
  DATABASE_URL?: string;
  /** Required for remote Turso; unused for a local file. */
  DATABASE_AUTH_TOKEN?: string;
}

export function resolveConfig(env: DatabaseEnv = {}): Config {
  const url = env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  const authToken = env.DATABASE_AUTH_TOKEN?.trim();

  // A remote URL without a token fails at query time with an opaque error;
  // say so at construction instead.
  if (/^(libsql|wss?|https):\/\//.test(url) && !authToken) {
    throw new Error(
      `DATABASE_URL "${url}" is remote but DATABASE_AUTH_TOKEN is not set. ` +
        `Set the token, or use a local file URL such as "${DEFAULT_DATABASE_URL}".`
    );
  }

  return authToken ? { url, authToken } : { url };
}

/** Creates a raw LibSQL client. Prefer `createDb` unless you need the client. */
export function createLibsqlClient(env: DatabaseEnv = {}): Client {
  return createClient(resolveConfig(env));
}

/**
 * Creates a Drizzle instance bound to the shared schema.
 *
 * Connections are not pooled here: LibSQL's client manages its own, and a
 * module-level singleton would leak across requests in a serverful runtime.
 * Callers hold the instance for as long as they need it.
 */
export function createDb(env: DatabaseEnv = {}): Database {
  return drizzle(createLibsqlClient(env), { schema });
}

export { coreSchema, stagingSchema };
export * from "./schema/core";
export * from "./schema/staging";
