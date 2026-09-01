// SPDX-License-Identifier: AGPL-3.0-or-later
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

  /*
   * There is deliberately no `PUBLIC_ADMIN_API_URL`. The admin API is not
   * called from a browser at all: the moderation panel is server-rendered on
   * the private admin host (`deploy/admin/server.ts`), which holds
   * `ADMIN_API_TOKEN` in its own environment and calls the handler in-process.
   * Publishing the endpoint here would only advertise a privileged service the
   * portal has no credential for.
   */
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
