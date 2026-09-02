// Thin storage adapter so the rest of the Worker never touches D1 or LibSQL directly.
//
// Production default: Cloudflare D1, via the `DB` binding in wrangler.toml.
// Alternative: Turso/LibSQL (local file, self-hosted sqld, or Turso's hosted service) -
// set the LIBSQL_URL secret (and LIBSQL_AUTH_TOKEN if the server requires auth) and this
// adapter switches transparently. Nothing in session.js or index.js needs to know which
// backend is active.
//
// All three methods take positional `?`-style params, matching both D1's and LibSQL's
// prepared statement conventions.

export function createDb(env) {
  if (env.LIBSQL_URL) {
    return createLibsqlDb(env);
  }
  if (env.DB) {
    return createD1Db(env);
  }
  throw new Error(
    "No database configured: bind D1 as `DB` in wrangler.toml, or set the LIBSQL_URL secret."
  );
}

function createD1Db(env) {
  return {
    async get(sql, params = []) {
      const row = await env.DB.prepare(sql)
        .bind(...params)
        .first();
      return row ?? null;
    },
    async all(sql, params = []) {
      const { results } = await env.DB.prepare(sql)
        .bind(...params)
        .all();
      return results ?? [];
    },
    async run(sql, params = []) {
      const result = await env.DB.prepare(sql)
        .bind(...params)
        .run();
      return { changes: result.meta?.changes ?? 0, lastRowId: result.meta?.last_row_id };
    },
  };
}

// LibSQL client is loaded lazily so Workers deployments that only ever use D1 don't pay
// for bundling it. `@libsql/client/web` is the fetch-based build meant for edge runtimes
// (no Node builtins), so it works fine inside a Worker too.
let libsqlClientPromise;
function getLibsqlModule() {
  if (!libsqlClientPromise) libsqlClientPromise = import("@libsql/client/web");
  return libsqlClientPromise;
}

function createLibsqlDb(env) {
  let clientPromise;
  async function client() {
    if (!clientPromise) {
      const { createClient } = await getLibsqlModule();
      clientPromise = Promise.resolve(
        createClient({
          url: env.LIBSQL_URL,
          authToken: env.LIBSQL_AUTH_TOKEN || undefined,
        })
      );
    }
    return clientPromise;
  }

  return {
    async get(sql, params = []) {
      const c = await client();
      const { rows } = await c.execute({ sql, args: params });
      return rows[0] ?? null;
    },
    async all(sql, params = []) {
      const c = await client();
      const { rows } = await c.execute({ sql, args: params });
      return rows;
    },
    async run(sql, params = []) {
      const c = await client();
      const result = await c.execute({ sql, args: params });
      return { changes: Number(result.rowsAffected ?? 0), lastRowId: result.lastInsertRowid };
    },
  };
}
