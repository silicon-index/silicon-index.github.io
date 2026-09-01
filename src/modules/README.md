# Modules

The portal is organised by **ecosystem module**, mirroring the repositories in
the `silicon-index` org. Each directory owns the portal-side logic for one
module plus the wire contract that module publishes.

These are *not* copies of those repositories. Each sibling module lives in its
own GitHub repo; this frontend stays decoupled and consumes their published
JSON at runtime via `raw.githubusercontent.com`, with local fallbacks.

## Layout

Every module carries a `contracts.ts` (pure types, no runtime imports), any
implementation it owns, and its own `README.md`.

| Module | Contracts | Implementation | Mirrors |
| :--- | :--- | :--- | :--- |
| `ai/` | fair-value + anomaly I/O, `AutoAcceptDecision` | `engine.ts`, `api.ts` | `silicon-index-ai.github.io` |
| `admin/` | `SubmissionStatus`, `ModerationAction`, `AUTO_ACCEPT_RULES` | `moderation.ts` | `silicon-index-admin-dashboard.github.io` |
| `contributors/` | tiers, `PriceSubmission`, verification schema, wire shape | `registry.ts`, `identity.ts` | `silicon-index-contributors.github.io` |
| `database/` | `HardwareComponent`, validation models | `adapters.ts`, `schemas.ts`, `validate.ts`, `api.ts` | `silicon-index-market-database.github.io` |
| `scrapers/` | ingestion payload, store whitelist, sanitization | `sanitize.ts`, `api.ts` | `silicon-index-market-scrapers.github.io` |
| `security/` | advisory payload, incident reporting | — | `silicon-index-security.github.io` |

## Dependency rule

Contracts are layered so the graph stays acyclic:

```
layer 0   admin/contracts   database/contracts   scrapers/contracts   security/contracts
            ↑        ↑          ↑         ↑              ↑
layer 1   contributors/contracts        ai/contracts
            ↑                              ↑
layer 2   implementations (engine, moderation, registry, adapters, identity)
            ↑                              ↑
          services/dataService.ts   ·   lib/types.ts (re-export facade)
            ↑
          components / pages / layouts
```

- A `contracts.ts` file imports **only other contracts, type-only**. None has a
  runtime import, so importing one can never pull in behaviour.
- `services/dataService.ts` owns transport and storage and composes modules.
- `src/lib/types.ts` is a **facade**: it re-exports the module contracts so app
  code can import from one familiar path. The direction is one-way — `lib/types`
  imports from `modules/*`, never the reverse.

Both properties are verified mechanically, not by convention: a script walks
every import edge, asserts each `contracts.ts` is free of runtime imports, and
runs a DFS cycle check over the whole `src/` tree.

## Importing

Use the `@modules/*` alias (declared in `tsconfig.json`, `astro.config.mjs`, and
`vite.config.mjs` from the shared map in `aliases.mjs`):

```ts
import type { HardwareComponent } from "@modules/database/contracts";
import type { PriceSubmission } from "@modules/contributors/contracts";
import { evaluateAutoAccept } from "@modules/ai/engine";
```

Prefer the owning module over the `lib/types` facade in new code.

## Two kinds of type

| Where | What it is |
| :--- | :--- |
| `<id>/contracts.ts` (the `*Submission` / `*Schema` upstream shapes) | The **wire shape** that repo publishes. Changes when that repo changes. |
| `<id>/contracts.ts` (the canonical models) | The portal's **internal model**. Changes when the UI needs it. |

Adapters between the two live beside them, so an upstream schema change is
absorbed in one place instead of rippling through components.

## Headless APIs

`database`, `ai`, and `scrapers` each expose a WinterCG `api.ts` that runs
unchanged in a container or on Cloudflare Workers — see [`deploy/`](../../deploy).
`npm run check:arch` fails the build if one gains a Node builtin, an npm
dependency, or a path alias.

## Status

Every sibling repo currently contains only a stub `README.md`/`LICENSE` with
GitHub Pages disabled (verified via the GitHub API), so nothing is published at
the raw endpoints yet and every fetch resolves from the local fallback. Run
`scripts/sync-modules.sh` to publish the data contracts.
