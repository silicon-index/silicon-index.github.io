// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * AI Models — headless API entry point.
 *
 * WinterCG compliant: the handler takes a standard `Request` and returns a
 * standard `Response`. No `node:*` imports, no framework, no filesystem — the
 * identical module runs on Node, Bun, Deno, and Cloudflare Workers.
 *
 * Pure computation, so this is a natural fit for the edge: no upstream fetch,
 * no state, no cold-start data loading.
 *
 * Routes
 *   GET  /health          liveness + the rule set in force
 *   POST /score           FairValueInput          -> FairValueOutput
 *   POST /detect-anomaly  AnomalyDetectionInput   -> AnomalyDetectionOutput
 *   POST /auto-accept     { submission, components } -> AutoAcceptDecision
 *
 * Imports are RELATIVE, never the `@modules/*` alias: wrangler, Bun, and
 * `tsc` all resolve relative specifiers without extra configuration.
 */

import { fail, json, methodNotAllowed, notFound, readJson, withApiMiddleware, type ApiEnv } from "../../platform/http";
import { requireServiceToken } from "../security/serviceAuth";
import { AUTO_ACCEPT_RULES } from "../admin/contracts";
import type { AnomalyDetectionInput, FairValueInput } from "./contracts";
import type { HardwareComponent } from "../database/contracts";
import type { PriceSubmission } from "../contributors/contracts";
import { detectAnomaly, evaluateAutoAccept, scoreFairValue } from "./engine";

interface AutoAcceptRequestBody {
  submission: PriceSubmission;
  components: HardwareComponent[];
}

function hasSeries(value: unknown): value is { historicalPrices: unknown } {
  return typeof value === "object" && value !== null && "historicalPrices" in value;
}

async function route(request: Request, env: ApiEnv): Promise<Response> {
  const { pathname } = new URL(request.url);


  /*
   * Tier-2 gate, FAIL-CLOSED: without the module's token every route is
   * denied, including /health. An unset secret must never leave an endpoint
   * open — a config slip would otherwise silently publish the service.
   */
  const denied = await requireServiceToken(request, env as Record<string, string | undefined>, "ai");
  if (denied) return denied;

  if (pathname === "/health") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return json({ status: "ok", module: "ai", rules: AUTO_ACCEPT_RULES });
  }

  if (pathname === "/score") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const body = await readJson<FairValueInput>(request);
    if (!body.ok) return body.response;
    if (!hasSeries(body.value) || !Array.isArray(body.value.historicalPrices)) {
      return fail(422, "Invalid FairValueInput", "historicalPrices must be an array of [timestamp, price] pairs.");
    }
    return json(scoreFairValue(body.value));
  }

  if (pathname === "/detect-anomaly") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const body = await readJson<AnomalyDetectionInput>(request);
    if (!body.ok) return body.response;
    if (!hasSeries(body.value) || !Array.isArray(body.value.historicalPrices)) {
      return fail(422, "Invalid AnomalyDetectionInput", "historicalPrices must be an array of [timestamp, price] pairs.");
    }
    return json(detectAnomaly(body.value));
  }

  if (pathname === "/auto-accept") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const body = await readJson<AutoAcceptRequestBody>(request);
    if (!body.ok) return body.response;
    const { submission, components } = body.value ?? {};
    if (!submission || !Array.isArray(components)) {
      return fail(422, "Invalid body", "Expected { submission, components[] }.");
    }
    return json(evaluateAutoAccept(submission, components));
  }

  return notFound(pathname);
}

/** Exported for direct testing — call it with a `Request`, no server needed. */
export const handleRequest = withApiMiddleware(route);

/** Cloudflare Workers / Bun / Deno entry point. */
export default { fetch: handleRequest };
