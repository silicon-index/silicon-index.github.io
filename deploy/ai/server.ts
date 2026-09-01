// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Container bootstrap for the ai module API (Coolify, Fly, any Docker host).
 *
 * This is the only runtime-specific file in the deployment. The handler it
 * serves — src/modules/ai/api.ts — is pure WinterCG and is byte-identical
 * to what Cloudflare Workers runs via wrangler.toml.
 *
 * Bun is used because it executes TypeScript directly and exposes a fetch
 * server natively, so there is no build step and no adapter layer.
 */
import api from "../../src/modules/ai/api";

const port = Number(Bun.env.PORT ?? "8080");

Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: (request) => api.fetch(request, Bun.env as Record<string, string | undefined>)
});

console.log(`[ai] listening on :${port}`);
