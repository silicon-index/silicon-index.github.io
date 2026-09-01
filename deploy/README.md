# Deployment — headless module APIs

Dual-target deployment for the three headless modules, with no vendor lock-in:
the **same handler** runs in a container (Coolify, Fly, any Docker host) and on
Cloudflare Workers. There is no adapter layer and no per-target build.

| Module | Handler | Container | Worker |
| :--- | :--- | :--- | :--- |
| Market Database | `src/modules/database/api.ts` | `deploy/database/Dockerfile` | `deploy/database/wrangler.toml` |
| AI Models | `src/modules/ai/api.ts` | `deploy/ai/Dockerfile` | `deploy/ai/wrangler.toml` |
| Market Scrapers | `src/modules/scrapers/api.ts` | `deploy/scrapers/Dockerfile` | `deploy/scrapers/wrangler.toml` |

## Why the same file runs on both

Each `api.ts` is WinterCG compliant: it takes a standard `Request`, returns a
standard `Response`, and reads upstream data with the standard `fetch`. It has

- no `node:*` builtins,
- no npm dependencies (relative imports only),
- no filesystem access,
- no framework.

`server.ts` in each directory is the **only** runtime-specific file — a five
line Bun bootstrap that hands the same handler to `Bun.serve`. Cloudflare needs
no bootstrap at all, since `export default { fetch }` is already its contract.

This is enforced, not just documented: `npm run check:arch` fails the build if
an `api.ts` gains a Node builtin, an npm dependency, or a path alias that
wrangler and Bun cannot resolve.

## Container (Coolify)

Build from the **repository root** — the Dockerfile expects that context:

```bash
docker build -f deploy/ai/Dockerfile -t silicon-index-ai-api .
docker run -p 8080:8080 silicon-index-ai-api
```

In Coolify: point the application at this repo, set the Dockerfile path to
`deploy/<module>/Dockerfile`, keep the build context at the repo root, and
expose port `8080` (override with `PORT`). The image declares a `HEALTHCHECK`
against the handler's own `/health` route, so the platform's health status
reflects the real request path.

Images are ~130 MB and contain no `node_modules`, because the handlers have no
dependencies to install.

## Cloudflare Workers

```bash
npx wrangler dev    --config deploy/ai/wrangler.toml
npx wrangler deploy --config deploy/ai/wrangler.toml
```

`wrangler` is intentionally **not** a dependency of this repo — the portal is a
static site and does not need it. Install it ad hoc as above, or add it to the
repo that owns the module after the multi-repo split.

No `nodejs_compat` flag is set anywhere. If one becomes necessary, the handler
has stopped being portable; fix the handler rather than adding the flag.

## Configuration

Values come from `env` — Worker `[vars]`/secrets, or container environment
variables. Both reach the handler through the same second argument.

| Variable | Modules | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `PORT` | all (container only) | `8080` | Listen port |
| `MARKET_DATA_URL` | database | market-database `dev` raw URL | Upstream dataset |
| `ALLOWED_ORIGINS` | all | `*` | Comma-separated CORS origins, or `*` |
| `STORE_WHITELIST` | scrapers | `[]` | Reviewed stores, as a JSON array |

## Routes

**database** — `GET /health`, `GET /components`, `GET /components/:sku`,
`POST /validate`

**ai** — `GET /health`, `POST /score`, `POST /detect-anomaly`,
`POST /auto-accept`

**scrapers** — `GET /health`, `GET /whitelist`, `POST /sanitize`,
`POST /sanitize/batch`

**contributors** — `GET /token`, `POST /contribute` (public tier-1 token)

**admin** — `GET /queue`, `POST /decide` (tier-2 `ADMIN_API_TOKEN`, every route)

### Service tokens

Every module API is **fail-closed**: without its token in the environment, all
routes return 503. Tokens are per module, so one credential opens exactly one
service. `ADMIN_API_TOKEN` and `DATABASE_API_TOKEN` are never `PUBLIC_` and
never reach a browser — the admin dashboard asks the operator to paste theirs,
and `npm run check` fails the build if a page ever reads one.

## Before exposing these publicly

- **Service tokens are mandatory.** Every module fails closed without its
  token, so a deployment with no secret set serves 503 rather than opening up.
- **CORS defaults to `*`.** Appropriate for a public read API; set
  `ALLOWED_ORIGINS` to restrict it.
- **`STORE_WHITELIST` ships empty on purpose.** A store is added only after its
  terms and robots policy have been reviewed (DEV-GUIDE.md §4). Until then
  `/sanitize` rejects everything, which is the correct failure direction.
- **No rate limiting.** Add it at the platform edge (Cloudflare rules, or a
  reverse proxy in front of the container).

## Testing without deploying

The handlers are ordinary functions, so they can be exercised with no server
and no container:

```ts
import api from "../src/modules/ai/api";
const res = await api.fetch(new Request("http://local/health"));
```
