/**
 * Market Scrapers — headless API entry point.
 *
 * WinterCG compliant: standard `Request`/`Response`, no `node:*` imports, no
 * filesystem. The identical module runs on Node, Bun, Deno, and Cloudflare
 * Workers.
 *
 * This service performs sanitization only — it does not itself crawl. Workers
 * submit raw records here and receive either a clean `IngestionPayload` or a
 * complete list of rejections, so the whitelist rule (DEV-GUIDE.md §2) is
 * enforced in one place rather than in every worker.
 *
 * Routes
 *   GET  /health        liveness + whitelist size
 *   GET  /whitelist     the store whitelist in force
 *   POST /sanitize      one raw record   -> SanitizationResult
 *   POST /sanitize/batch { records: [] } -> SanitizationResult[]
 *
 * Imports are RELATIVE, never the `@modules/*` alias: wrangler, Bun, and
 * `tsc` all resolve relative specifiers without extra configuration.
 */

import { fail, json, methodNotAllowed, notFound, readJson, withApiMiddleware, type ApiEnv } from "../../lib/http";
import { PERMITTED_INGESTION_FIELDS, STRIPPED_QUERY_PREFIXES, type StoreWhitelist } from "./contracts";
import { sanitizeBatch, sanitizeRecord } from "./sanitize";

/**
 * Default store whitelist.
 *
 * Deliberately empty: a store is added only after its terms and robots policy
 * have been reviewed (DEV-GUIDE.md §4). Shipping a populated default would
 * imply an approval that has not happened. Supply the real list via
 * configuration when deploying.
 */
export const DEFAULT_STORE_WHITELIST: StoreWhitelist = [];

function whitelistFrom(env: ApiEnv & { STORE_WHITELIST?: string }): StoreWhitelist {
  if (!env.STORE_WHITELIST) return DEFAULT_STORE_WHITELIST;
  try {
    const parsed: unknown = JSON.parse(env.STORE_WHITELIST);
    return Array.isArray(parsed) ? (parsed as StoreWhitelist) : DEFAULT_STORE_WHITELIST;
  } catch {
    return DEFAULT_STORE_WHITELIST;
  }
}

async function route(request: Request, env: ApiEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  const whitelist = whitelistFrom(env);

  if (pathname === "/health") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return json({
      status: "ok",
      module: "scrapers",
      whitelistedStores: whitelist.length,
      permittedFields: PERMITTED_INGESTION_FIELDS,
      strippedQueryPrefixes: STRIPPED_QUERY_PREFIXES
    });
  }

  if (pathname === "/whitelist") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return json({ count: whitelist.length, stores: whitelist });
  }

  if (pathname === "/sanitize") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const body = await readJson<unknown>(request);
    if (!body.ok) return body.response;
    const result = sanitizeRecord(body.value, whitelist);
    // A rejected record is a client-side data problem, not a server fault.
    return json(result, { status: result.accepted ? 200 : 422 });
  }

  if (pathname === "/sanitize/batch") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const body = await readJson<{ records?: unknown[] }>(request);
    if (!body.ok) return body.response;
    const records = body.value?.records;
    if (!Array.isArray(records)) return fail(422, "Invalid body", "Expected { records: [...] }.");

    const results = sanitizeBatch(records, whitelist);
    const accepted = results.filter((r) => r.accepted).length;
    return json({ total: results.length, accepted, rejected: results.length - accepted, results });
  }

  return notFound(pathname);
}

/** Exported for direct testing — call it with a `Request`, no server needed. */
export const handleRequest = withApiMiddleware(route);

/** Cloudflare Workers / Bun / Deno entry point. */
export default { fetch: handleRequest };
