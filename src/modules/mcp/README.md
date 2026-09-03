# Silicon Index — MCP Server

- **Target repo:** `https://github.com/silicon-index/silicon-index-backend-api`
- **Branch:** `dev`

Model Context Protocol server exposing Silicon Index market/pricing data to AI agents
(Streamable HTTP transport).

## Tools

- `search_components` — filter the catalogue by name/SKU substring, category, and/or
  manufacturer. Returns compact summaries.
- `get_component` — full record for one SKU, including specs and price history.
- `score_fair_value` — deterministic fair-value score for a SKU, from `ai/engine.ts`
  (the same algorithm the screener uses — not an LLM judgment).
- `detect_price_anomaly` — checks a reported price against a SKU's own tracked history.

## Headless API

`api.ts` — `GET /health`, plus the MCP Streamable HTTP transport mounted at the root
(`POST`/`GET`/`DELETE`), backed by `@modelcontextprotocol/server`. Composes the
`database` module in-process (its own `Request`/`Response` contract — unauthenticated,
read-only, so no service token needed) and calls the `ai` module's pure scoring
functions directly, bypassing its HTTP service-token gate: that gate protects the
*network* endpoint, not in-process composition by another module in the same
deployment. Read-only and public, same trust posture as `database`. Deploy via
`deploy/mcp/`.
