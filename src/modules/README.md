# Module Stubs

Each subdirectory documents one external `silicon-index` repository and holds the
**wire contract** the portal expects that module to publish.

These are *not* copies of those repositories. Each sibling module lives in its own
GitHub repo; this frontend stays decoupled from them and consumes their published
JSON at runtime via `raw.githubusercontent.com`, with local fallbacks
(see `src/services/dataService.ts`).

Two distinct kinds of type live in this project — keep them separate:

| Where | What it is |
| :--- | :--- |
| `src/modules/<id>/*.ts` | The **upstream wire shape** a module publishes. Changes when that repo changes. |
| `src/services/dataService.ts` | The portal's **internal canonical model**. Changes when the UI needs it. |

Each contract file provides an adapter into the canonical model, so an upstream
schema change is absorbed in one place instead of rippling through components.

Status: every sibling repo currently contains only a stub `README.md`/`LICENSE`
with GitHub Pages disabled (verified via the GitHub API), so nothing is published
at these paths yet and every fetch resolves from the local fallback.
