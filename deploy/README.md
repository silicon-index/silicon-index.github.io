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

## Portal on Cloudflare (static assets)

The portal itself is not a module API and has no Worker script. `wrangler.jsonc`
in the **repository root** deploys it as static assets:

```jsonc
{ "name": "silicon-index", "assets": { "directory": "./dist" } }
```

| Setting | Value |
| :--- | :--- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` (production) / `npx wrangler versions upload` (previews) |
| Output | `dist/` — Astro's static build |

**Why the first attempt failed.** Wrangler assumes a script Worker and looks for
an entry point; `output: "static"` means there is none, so
`wrangler versions upload` errored with "Worker's entry point not specified".
The fix is `assets.directory`, not a `main` — adding `main` would mean writing a
Worker the portal does not need. GitHub Pages continues to deploy from
`.github/workflows/deploy.yml`; the two targets serve the same `dist/`.

**This config ships `dist/` and nothing else.** The module APIs keep their own
`--config` files, and `deploy/admin/` is Node-only, is not part of the Astro
build, and must never be given a public Cloudflare route — see § Admin panel.

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
never reach a browser at all — the admin panel runs on a private host that
holds the token in its own environment (see below), and `npm run check` fails
the build if client-reachable code ever reads a server secret or sends the
`x-service-token` header.

## Admin panel (private LXC host)

`deploy/admin/` is different from the three module deployments above: it is not
a public API, it is the **operator's dashboard**, and it never runs on the
static portal.

| | |
| :--- | :--- |
| Bootstrap | `deploy/admin/server.ts` (Node — `node:http`, not a Worker) |
| View | `deploy/admin/dashboard.ts` — server-rendered HTML, zero client JS |
| Unit | `deploy/admin/silicon-index-admin.service` |
| Handler | `src/modules/admin/api.ts`, called in-process and never exposed |

### Why it is not on the portal

The portal is a static site on GitHub Pages with no request-time server, so a
page there has nowhere to keep a tier-2 secret: Astro inlines only `PUBLIC_*`
into the bundle, and anything inlined is published. The previous dashboard
worked around that by asking the operator to paste `ADMIN_API_TOKEN` and
holding it in a module-scoped variable — a live credential inside a browser,
lost on every refresh. That is gone, along with `PUBLIC_ADMIN_API_URL`: the
browser now carries no admin credential of any kind.

Here, an environment variable is a real place to keep a secret. The token is
read once at boot, attached to each in-process call, and verified by the same
`requireServiceToken` double-HMAC constant-time comparison an external caller
would face — the panel is not a trusted-caller shortcut around authentication.

### Run it

```bash
npm ci                                   # devDependencies included: vite-node runs the panel
cp .env.example .env                     # then set ADMIN_API_TOKEN (openssl rand -base64 32)
npm run admin:serve
```

It refuses to start if `ADMIN_API_TOKEN` is unset or shorter than 24
characters, so a misconfigured unit is a dead unit rather than an open admin
panel. Routes: `GET /health`, `GET /` (queue), `POST /decide`.

### Install on the LXC container

```bash
adduser --system --group --home /opt/silicon-index siadmin
git clone <repo> /opt/silicon-index && cd /opt/silicon-index && npm ci

install -d -m 0750 /etc/silicon-index
install -m 0600 -o siadmin -g siadmin /dev/null /etc/silicon-index/admin.env
printf 'ADMIN_API_TOKEN=%s\n' "$(openssl rand -base64 32)" >> /etc/silicon-index/admin.env
printf 'DATABASE_URL=file:/opt/silicon-index/local.db\n'    >> /etc/silicon-index/admin.env

cp deploy/admin/silicon-index-admin.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now silicon-index-admin
```

Configuration comes from the environment, and an already-set variable always
wins over the repo's `.env` — so the systemd `EnvironmentFile=` above is
authoritative and a stray `.env` in the checkout cannot override it.

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `ADMIN_API_TOKEN` | *(required)* | Tier-2 credential; ≥24 chars or the panel will not start |
| `ADMIN_PANEL_PORT` | `8081` | Listen port (`PORT` is honoured as a fallback) |
| `ADMIN_PANEL_HOST` | `127.0.0.1` | Bind address (`HOST` as a fallback) |
| `DATABASE_URL` | `file:local.db` | Staging/core database |
| `DATABASE_AUTH_TOKEN` | — | Required only for a remote `libsql://` URL |

### Trust boundary — read before exposing it

**Reaching this port is being an administrator.** Removing the paste step means
the browser presents no credential, so there is no login in front of the queue:
the network path *is* the authentication.

- It binds to `127.0.0.1` unless `ADMIN_PANEL_HOST` says otherwise, and logs a
  warning when bound wider. Never put it on `0.0.0.0` with a routable address.
- Reach it over the LXC host's private bridge, a VPN, or an SSH tunnel:
  `ssh -N -L 8081:127.0.0.1:8081 siadmin@<lxc-host>`, then open
  `http://127.0.0.1:8081`.
- If it must be reachable more widely, put an authenticating reverse proxy in
  front of it and terminate TLS there.
- Mutating posts carry a per-process CSRF token and require a same-origin
  `Origin` header, so a page the operator happens to have open cannot promote a
  submission into the trusted index.

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
