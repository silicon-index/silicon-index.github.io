/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the deployed `database` module API, e.g.
   * `https://silicon-index-database-api.example.workers.dev`.
   *
   * Optional. Unset, the portal falls straight through to the market-database
   * repo's raw `dev` branch and then to the bundled dataset.
   *
   * `PUBLIC_` vars are inlined into the client bundle by Astro — never put a
   * secret here.
   */
  readonly PUBLIC_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
