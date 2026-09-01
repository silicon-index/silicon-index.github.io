// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Market Database — Cloudflare D1 connection wrapper (edge).
 *
 * The other half of the portability story. `db.ts` uses `@libsql/client`,
 * which is Node-targeted and cannot talk to D1; D1 arrives as a Worker binding
 * and is reached through Drizzle's own `drizzle-orm/d1` driver.
 *
 * What is genuinely shared is `schema.ts` and therefore every query written
 * against it — both drivers are `drizzle-orm/sqlite-core` underneath, so
 * application code is identical and only the constructor differs:
 *
 * ```ts
 * // container
 * const db = createDb({ DATABASE_URL: env.DATABASE_URL });
 * // worker
 * const db = createD1Db(env.DB);
 * ```
 *
 * This module imports no `node:*` builtins and no LibSQL, so it is safe in a
 * Worker bundle.
 */

import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import { coreSchema } from "./schema/core";
import { stagingSchema } from "./schema/staging";

const schema = { ...coreSchema, ...stagingSchema };

export type D1Database = DrizzleD1Database<typeof schema>;

/**
 * Minimal structural stand-in for Cloudflare's `D1Database` binding.
 *
 * Declared here rather than pulling in `@cloudflare/workers-types`: a
 * dependency solely for one binding type would weigh on every build, and the
 * Worker runtime supplies the real object.
 */
export interface D1Binding {
  prepare(query: string): unknown;
  batch<T = unknown>(statements: unknown[]): Promise<T[]>;
  exec(query: string): Promise<unknown>;
}

/** Creates a Drizzle instance over a D1 binding, bound to the shared schema. */
export function createD1Db(binding: D1Binding): D1Database {
  // The cast bridges the structural stand-in above to the driver's expected
  // type; at runtime this is Cloudflare's real binding object.
  return drizzle(binding as never, { schema });
}

export { schema, coreSchema, stagingSchema };
export * from "./schema/core";
export * from "./schema/staging";
