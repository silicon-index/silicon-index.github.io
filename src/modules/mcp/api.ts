// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * MCP server — headless API entry point.
 *
 * Exposes Silicon Index market/pricing data to AI agents over the Model
 * Context Protocol (Streamable HTTP transport). Mirrors the composition
 * pattern the rest of the modules use: tools call the `database` module's
 * `api.ts` in-process via its own `Request`/`Response` contract (it is
 * unauthenticated and read-only, so no service token is needed for that),
 * and call the `ai` module's pure scoring functions directly — bypassing its
 * HTTP layer's service-token gate, since that gate exists to keep the *network*
 * endpoint closed, not to restrict in-process composition by another module
 * in the same deployment.
 *
 * WinterCG-compatible at the transport boundary (`export default { fetch }`),
 * though the MCP SDK itself is the one npm dependency this module carries —
 * unlike `database`/`ai`/`scrapers`, an MCP server without the official SDK
 * would mean reimplementing the JSON-RPC/Streamable-HTTP wire protocol by
 * hand, which is not worth doing.
 */

import * as z from "zod/v4";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { corsHeaders, type ApiEnv } from "../../platform/http";
import databaseApi from "../database/api";
import { scoreFairValue, detectAnomaly } from "../ai/engine";
import type { HardwareComponent } from "../database/contracts";

const CATEGORIES = ["CPU", "GPU", "RAM", "MOBO", "STORAGE"] as const;

const TOOL_NAMES = ["search_components", "get_component", "score_fair_value", "detect_price_anomaly"] as const;

interface ComponentIndex {
  all: HardwareComponent[];
  bySku: Map<string, HardwareComponent>;
}

/**
 * Every tool call was independently re-fetching and re-normalizing the full
 * catalogue from `database`'s upstream JSON, then doing an O(n) linear scan
 * for a single SKU. Neither is necessary within a short window: the catalogue
 * doesn't change second to second, and a single request often calls several
 * tools in sequence (e.g. search_components then get_component on a result).
 *
 * `createMcpHandler` builds a fresh McpServer per HTTP request (correctly —
 * that's what makes it stateless-safe), but the module-level cache below
 * lives across requests within the same warm isolate/process, same as any
 * other module-scoped `let` in a Worker or a long-running Bun process. A
 * short TTL keeps it from ever serving meaningfully stale data.
 */
const CACHE_TTL_MS = 30_000;
let cache: { index: ComponentIndex; expiresAt: number } | null = null;

async function loadComponentIndex(env: ApiEnv): Promise<ComponentIndex> {
  if (cache && cache.expiresAt > Date.now()) return cache.index;

  const response = await databaseApi.fetch(new Request("http://internal/components"), env);
  if (!response.ok) {
    throw new Error(`database module responded ${response.status}`);
  }
  const body = (await response.json()) as { components: HardwareComponent[] };

  const bySku = new Map<string, HardwareComponent>();
  for (const component of body.components) bySku.set(component.sku, component);

  const index: ComponentIndex = { all: body.components, bySku };
  cache = { index, expiresAt: Date.now() + CACHE_TTL_MS };
  return index;
}

function summarize(component: HardwareComponent) {
  return {
    sku: component.sku,
    name: component.name,
    category: component.category,
    manufacturer: component.manufacturer,
    releaseYear: component.releaseYear,
    currency: component.currency,
    marketPrice: component.medianMarketPrice,
    fairValueScore: component.fairValueScore
  };
}

function buildServer(env: ApiEnv): McpServer {
  const server = new McpServer({ name: "silicon-index-market-data", version: "1.0.0" });

  server.registerTool(
    "search_components",
    {
      description:
        "Search the Silicon Index hardware catalogue by name/SKU substring, category, and/or manufacturer. " +
        "Returns compact summaries (sku, name, category, manufacturer, market price, fair-value score).",
      inputSchema: z.object({
        query: z.string().optional().describe("Substring matched against name or SKU, case-insensitive"),
        category: z.enum(CATEGORIES).optional(),
        manufacturer: z.string().optional().describe("Exact manufacturer match, case-insensitive"),
        limit: z.number().int().min(1).max(100).default(20)
      })
    },
    async ({ query, category, manufacturer, limit }) => {
      const { all: components } = await loadComponentIndex(env);
      const q = query?.toLowerCase();
      const mfr = manufacturer?.toLowerCase();
      const matches = components
        .filter((c) => !category || c.category === category)
        .filter((c) => !mfr || c.manufacturer.toLowerCase() === mfr)
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.sku.toLowerCase().includes(q))
        .slice(0, limit)
        .map(summarize);
      return { content: [{ type: "text", text: JSON.stringify({ count: matches.length, components: matches }, null, 2) }] };
    }
  );

  server.registerTool(
    "get_component",
    {
      description: "Fetch the full record for one component by exact SKU, including spec details and price history.",
      inputSchema: z.object({ sku: z.string() })
    },
    async ({ sku }) => {
      const { bySku } = await loadComponentIndex(env);
      const match = bySku.get(sku);
      if (!match) {
        return { content: [{ type: "text", text: `No component found for SKU "${sku}".` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(match, null, 2) }] };
    }
  );

  server.registerTool(
    "score_fair_value",
    {
      description:
        "Compute the deterministic fair-value score for a component from its own price history " +
        "(the same algorithm the screener uses, not an LLM judgment).",
      inputSchema: z.object({ sku: z.string() })
    },
    async ({ sku }) => {
      const { bySku } = await loadComponentIndex(env);
      const match = bySku.get(sku);
      if (!match) {
        return { content: [{ type: "text", text: `No component found for SKU "${sku}".` }], isError: true };
      }
      const result = scoreFairValue({
        sku: match.sku,
        msrp: match.originalMSRP,
        historicalPrices: match.historicalPrices,
        releaseYear: match.releaseYear
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "detect_price_anomaly",
    {
      description:
        "Check whether a reported price for a component is anomalous relative to its own tracked price history.",
      inputSchema: z.object({
        sku: z.string(),
        reportedPrice: z.number().positive(),
        currency: z.string().default("USD")
      })
    },
    async ({ sku, reportedPrice, currency }) => {
      const { bySku } = await loadComponentIndex(env);
      const match = bySku.get(sku);
      if (!match) {
        return { content: [{ type: "text", text: `No component found for SKU "${sku}".` }], isError: true };
      }
      const result = detectAnomaly({
        sku: match.sku,
        reportedPrice,
        currency,
        historicalPrices: match.historicalPrices
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}

/** Cloudflare Workers / Bun / Deno entry point. Stateless: a fresh MCP server per request. */
export default {
  async fetch(request: Request, env: ApiEnv = {}): Promise<Response> {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (new URL(request.url).pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok", module: "mcp", tools: TOOL_NAMES }), {
        headers: { ...headers, "content-type": "application/json; charset=utf-8" }
      });
    }

    const handler = createMcpHandler(() => buildServer(env));
    const response = await handler.fetch(request);

    const merged = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) merged.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
  }
};
