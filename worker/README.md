# Silicon Index admin API (Cloudflare Worker)

Serverless backend for the admin panel at [`/admin/`](../admin). Deployed independently
of the static site — GitHub Pages only serves static files, so this Worker (plus its D1
database) is the only piece of "always-on infrastructure," and Cloudflare Workers/D1's
free tier means there's no 24/7 server to pay for or keep patched.

## Why this design

- **No client persistence.** The browser never holds a token in `localStorage`,
  `sessionStorage`, or JS-readable state. The only thing the browser holds is an
  `HttpOnly` cookie it can't read or tamper with; the actual session lives in the DB with
  a server-enforced expiry.
- **Database-backed ephemeral sessions.** Sessions are rows in `sessions` (D1 or
  LibSQL), each with an `expires_at`. See [`src/session.js`](./src/session.js) for the
  selector/validator split-token design: the cookie encodes a public lookup key
  (selector) and a secret (validator); only an HMAC of the validator is ever stored, so a
  DB leak alone can't forge a session.
- **ChaCha20-Poly1305** encrypts the session payload (user id/username/role) at rest.
  The Workers runtime's Web Crypto does *not* actually implement this cipher (only
  AES-GCM/CBC/etc, confirmed against `wrangler dev`), so it's done via
  [`@noble/ciphers`](https://github.com/paulmillr/noble-ciphers) — an audited,
  dependency-free, pure-JS implementation that behaves identically across Workers,
  Node, and browsers.
- **Double-HMAC constant-time verification** (SHA-256) is used everywhere a
  secret-derived value is compared against a stored one — session validators and
  password hashes — per OWASP's guidance for timing-safe MAC comparison. See
  [`src/crypto.js`](./src/crypto.js).

## Deploy

```bash
cd worker
npm install

# 1. Create the D1 database and note the returned database_id
npx wrangler d1 create silicon-index-admin --config ./wrangler.toml
# paste that id into wrangler.toml's [[d1_databases]] block

# 2. Apply the schema
npm run db:migrate

# 3. Set secrets (never commit these)
npx wrangler secret put SESSION_HMAC_SECRET --config ./wrangler.toml   # e.g. `openssl rand -base64 32`
npx wrangler secret put SESSION_ENC_KEY --config ./wrangler.toml       # e.g. `openssl rand -base64 32 | tr '+/' '-_'`

# 4. Seed an admin user (hash a real password first — never insert plaintext).
#    Public sign-ups via POST /api/register always land as role='user' — an 'admin'
#    row can only be created this way, out-of-band.
npm run hash-password -- 'a-strong-password'
npx wrangler d1 execute silicon-index-admin --config ./wrangler.toml --command \
  "INSERT INTO users (username, email, password_hash, role, created_at) \
   VALUES ('admin', 'admin@example.com', '<hash printed above>', 'admin', unixepoch())"

# 5. Deploy
npm run deploy
```

> **Note:** the repo root also has its own `wrangler.jsonc` (for the Astro portal's own
> Cloudflare Pages deploy, on the `dev` branch — unrelated to this Worker). Wrangler can
> pick that up instead of this directory's `wrangler.toml` if you run bare `wrangler`
> commands from here without `--config`. The `npm run` scripts above already pass it
> explicitly; do the same for any ad-hoc `wrangler` command you run inside `worker/`.

Update `ALLOWED_ORIGIN` in `wrangler.toml` if the admin UI is served from anywhere
other than `https://silicon-index.github.io`, and update the `API_BASE` constant in
[`../admin/config.js`](../admin/config.js) to point at the deployed Worker URL.

## Switching to LibSQL/Turso instead of D1

Set `LIBSQL_URL` (and `LIBSQL_AUTH_TOKEN` if applicable) as secrets — `src/db.js` picks
LibSQL over D1 automatically the moment `LIBSQL_URL` is set, with zero code changes. This
works with a local `sqld` instance for development or Turso's hosted service. Apply
`schema.sql` against that database the same way you would for D1 (e.g. via `turso db
shell` or `libsql-client`).

## Local dev

```bash
npm run dev
```

`wrangler dev` runs the Worker locally against a local D1 replica (or your configured
LibSQL target). Point the admin UI's `API_BASE` at `http://127.0.0.1:8787` for testing,
and note that cookies will need `SameSite=None; Secure` to still work over plain HTTP in
some browsers — `wrangler dev --local-protocol https` avoids that friction.
