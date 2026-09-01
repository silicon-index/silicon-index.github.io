// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Market Database — headless API entry point.
 *
 * WinterCG compliant: standard `Request`/`Response`, and upstream data is read
 * with the standard `fetch` rather than the filesystem, so the identical
 * module runs on Node, Bun, Deno, and Cloudflare Workers.
 *
 * Routes
 *   GET  /health              liveness + upstream in use
 *   GET  /components          all normalized records
 *   GET  /components/:sku     one record (404 when unknown)
 *   POST /validate            candidate record -> ValidationResult
 *
 * Imports are RELATIVE, never the `@modules/*` alias: wrangler, Bun, and
 * `tsc` all resolve relative specifiers without extra configuration.
 */

import { fail, json, methodNotAllowed, notFound, readJson, withApiMiddleware, type ApiEnv } from "../../platform/http";
import { isHardwareComponentArray, toHardwareComponent } from "./adapters";
import type { ComponentEntry, HardwareComponent } from "./contracts";
import { validateHardwareComponent } from "./validate";

const DEFAULT_MARKET_DATA_URL =
  "https://raw.githubusercontent.com/silicon-index/silicon-index-market-database.github.io/dev/data/market-data.json";

function upstream(env: ApiEnv): string {
  return env.MARKET_DATA_URL ?? DEFAULT_MARKET_DATA_URL;
}

/**
 * Loads and normalizes upstream records.
 * Accepts either the already-normalized shape or the raw `ComponentEntry`
 * shape, matching the portal's own tolerance in `services/dataService.ts`.
 */
async function loadComponents(env: ApiEnv): Promise<HardwareComponent[]> {
  const url = upstream(env);
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Upstream ${url} responded ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (isHardwareComponentArray(payload)) return payload;
  if (!Array.isArray(payload)) throw new Error("Upstream payload is not an array");
  return (payload as ComponentEntry[]).map(toHardwareComponent);
}

async function route(request: Request, env: ApiEnv): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === "/health") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return json({ status: "ok", module: "database", upstream: upstream(env) });
  }

  if (pathname === "/components" || pathname.startsWith("/components/")) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);

    let components: HardwareComponent[];
    try {
      components = await loadComponents(env);
    } catch (err) {
      // The upstream repo may legitimately publish nothing yet; say so
      // precisely rather than returning an empty list that looks like data.
      return fail(502, "Upstream unavailable", (err as Error).message);
    }

    if (pathname === "/components") {
      return json({ count: components.length, components });
    }

    const sku = decodeURIComponent(pathname.slice("/components/".length));
    const match = components.find((component) => component.sku === sku);
    return match ? json(match) : fail(404, "Unknown SKU", sku);
  }

  if (pathname === "/validate") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const body = await readJson<unknown>(request);
    if (!body.ok) return body.response;
    const result = validateHardwareComponent(body.value);
    return json(result, { status: result.valid ? 200 : 422 });
  }

  return notFound(pathname);
}

/** Exported for direct testing — call it with a `Request`, no server needed. */
export const handleRequest = withApiMiddleware(route);

/** Cloudflare Workers / Bun / Deno entry point. */
export default { fetch: handleRequest };
