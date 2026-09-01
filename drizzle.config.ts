import type { Config } from "drizzle-kit";

/**
 * drizzle-kit configuration (dev tooling only — never bundled).
 *
 * `dialect: "sqlite"` is what makes one migration set serve both deployment
 * targets: LibSQL in a container and Cloudflare D1 at the edge speak the same
 * SQL. For D1, apply the generated files with
 * `wrangler d1 migrations apply <db>` instead of `drizzle-kit migrate`.
 */
export default {
  schema: "./src/modules/database/schema",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:local.db"
  },
  verbose: true,
  strict: true
} satisfies Config;
