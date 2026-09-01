# `src/` layout

Each directory has one job. If a file could plausibly live in two of them, the
question to ask is *who consumes it* — that is how every file below was placed.

```
src/
├── modules/     Domain. One directory per ecosystem repo; splittable.
├── platform/    Runtime primitives shared by the WinterCG API handlers.
├── ui/          Presentation: formatting, widgets, form descriptors.
├── components/  Astro components that compose ui/ + modules/.
├── layouts/     Page shells.
├── pages/       Routes.
├── services/    Transport/orchestration across modules (dataService).
├── config/      App configuration (navigation).
├── lib/         App-level odds and ends that belong to no module.
└── styles/      Global CSS.
```

## modules/ — the domain

One directory per repository in the `silicon-index` org, each owning its
`contracts.ts` (pure types, no runtime imports) plus the logic behind it. These
are the units intended to become separate repos, so they must not acquire
presentation or app concerns.

| Module | Owns |
| :--- | :--- |
| `database/` | Catalogue contracts, ingestion, validation, Drizzle schema, drivers, public read API |
| `contributors/` | Tiers, submissions, reputation, identity, public token, contribute API |
| `admin/` | Moderation contracts and actions, admin-managed settings, privileged API |
| `ai/` | Fair-value and anomaly contracts + engine, compute API |
| `scrapers/` | Ingestion whitelist, sanitization, compute API |
| `security/` | Advisory/incident contracts, service-token authentication |

## platform/ vs ui/ vs lib/

- **`platform/`** — used by API handlers on both deployment targets. Must stay
  WinterCG-safe: no `node:*`, no DOM. Currently `http.ts`.
- **`ui/`** — browser-only presentation. Formatting, the uPlot chart, the price
  drawer, and the per-category spec display/form descriptors. Never imported by
  a handler.
- **`lib/`** — genuinely app-level and owned by no module: the demo browser
  session (`auth.ts`) and the contract facade (`types.ts`). Keep this small; a
  file landing here usually belongs in a module.

## Enforced invariants

`npm run check` runs `scripts/check-architecture.mjs`, which fails the build on:

1. A `contracts.ts` with a runtime import (they must be type-only).
2. An import cycle anywhere in `src/` — tsc compiles those happily and they
   fail at runtime as undefined bindings.
3. An `api.ts` importing a `node:*` builtin, a path alias, or an npm package
   outside `API_RUNTIME_ALLOWLIST`.
4. Anything client-reachable (`pages/`, `components/`, `layouts/`, `ui/`, or an
   `api.ts`) reaching a server-only module such as `database/db.ts`.
5. **The airgap** — the public contribution path reaching `schema/core.ts`.
6. A block comment terminated early by a `*/` inside a glob.

Rules 4 and 5 walk the full import graph, so an indirect path through a barrel
file is caught too.
