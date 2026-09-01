# Silicon Index — Development Index

Tracks MVP build progress for the **Main Portal** (`silicon-index.github.io`) by phase. See [DEV-GUIDE.md](./DEV-GUIDE.md) for workflow and data standards.

---

## Phase 1 — Static MVP Screener (current)

1.1. `index.html` — semantic screener page with table container, sidebar filters, topbar
1.2. `style.css` — dark-mode-only, minimalist, responsive layout
1.3. `mock-data.json` — local sample dataset (CPUs, GPUs, motherboard) with 12-month price history per item
1.4. `app.js` — fetches mock data, renders table rows, filters (search, category, socket, release year, scalper-only), sorting (name, price, fair value, scalper margin)
1.5. `.nojekyll` — disable Jekyll processing for GitHub Pages
1.6. Scalper Alert badge — flags rows where `marketPrice > fairValueScore`

## Phase 2 — Component Detail View

2.1. Route/page per component (`component.html?id=...` or static per-id pages)
2.2. Left panel — immutable spec sheet (socket, generation, TDP, release year)
2.3. Right panel — time-series line chart of 12-month price history (canvas or lightweight chart lib)
2.4. Deep link from screener table rows into detail view

## Phase 3 — Community Ingestion Form (client-side demo, done)

3.1. Form UI — dropdown-only spec fields (Socket, Generation, Category) in `contribute.html`; free-text limited to component name, no arbitrary descriptions
3.2. Numeric-only inputs — Observed Price, TDP (with min/step validation)
3.3. Mandatory URL input — "Proof of Value" (link to completed transaction), validated as a well-formed URL
3.4. Client-side validation against the strict whitelist rule (see DEV-GUIDE.md §2)
3.5. Submission stub — stored in `localStorage` via `contributions.js`; payload shape mirrors the future backend API contract so swapping in `silicon-index-backend-api` later is a drop-in replacement
3.6. Anonymous submissions supported — signed-in username is attached when available, otherwise "Anonymous"; no PII collected either way

## Phase 4 — Trust Factor System (client-side demo, done)

4.1. Trust Score badges — Pending Validation, Trusted Contributor, Flagged — implemented in `contributions.js` / `admin.html`
4.2. Badge placement next to community-submitted price rows in the "Community Submissions" panel on `index.html`
4.3. Visual tiering (icon + color) without exposing contributor PII
4.4. `login.html` — demo register/sign-in (localStorage-backed, SHA-256-hashed passwords, no real server) with a seeded `admin`/`admin123` account
4.5. `admin.html` — role-gated moderation panel to approve/reject pending submissions

## Phase 5 — Backend Integration

5.0. Replace the `localStorage`-based auth (`auth.js`) and contribution queue (`contributions.js`) with real accounts/sessions and persistence in `silicon-index-backend-api`
5.1. Replace `mock-data.json` fetch with calls to `silicon-index-backend-api`
5.2. PostgreSQL schema mapping for component specs (static, immutable)
5.3. TimescaleDB hypertable integration for price history time-series
5.4. Fair Value Score computed server-side by the valuation engine (`silicon-index-ai`)

## Phase 6 — Hardening & Polish

6.1. Accessibility pass (keyboard nav, ARIA labels, contrast audit)
6.2. Performance — virtualized table rows for large datasets
6.3. Error/empty/loading states audit across all views
6.4. Cross-browser and mobile responsive QA

## Phase 7 — Contributors Index & Ecosystem Linking (client-side demo, done)

7.1. Fixed the "Contributors" ecosystem card (`index.html`) and the README ecosystem table to link to
     [`silicon-index-contributors.github.io` `dev` branch](https://github.com/silicon-index/silicon-index-contributors.github.io/tree/dev)
     instead of the GitHub Pages URL — that repo has Pages disabled and currently contains only a stub
     `README.md`/`LICENSE` (no templates published yet), so the Pages link 404'd.
7.2. Added `contributors-index.json` — a schema/seed file documenting the interim Contributors Index record
     shape (`contributor`, `isAnonymous`, `trust`, `approvedCount`, `lastApprovedAt`) for this portal to produce
     until the real `silicon-index-contributors` site defines its own templates.
7.3. `contributions.js` — added `getContributorsIndex()`, which aggregates only `status: "approved"` submissions
     (i.e. after admin check-up in `admin.html`) into one record per contributor, tagged "Anonymous Contribution"
     or "Trusted Contributor". Pending/rejected submissions are excluded.
7.4. Added a "Contributors" panel to `index.html` (below "Community Submissions"), rendered by
     `renderContributors()` in `app.js`, showing each contributor's trust badge, approved-submission count, and
     last-approved timestamp — sourced live from `localStorage`, matching the `contributors-index.json` shape.

## Phase 8 — Admin-Editable Data Source Settings & Anonymous Contributor IDs (client-side demo, done)

8.1. Fixed the "Market Database" ecosystem card (`index.html`) and README table to link to
     [`silicon-index-market-database.github.io` `dev` branch](https://github.com/silicon-index/silicon-index-market-database.github.io/tree/dev)
     instead of the GitHub Pages URL, for the same reason as 7.1 — that repo also has Pages disabled and only
     contains a stub `README.md`/`LICENSE`.
8.2. Added `settings.js` (`SiSettings`) — a `localStorage`-backed config module (`si_settings`) holding two
     editable pointers: `marketDbUrl` and `contributorsUrl`, defaulting to the two repos' `dev` branches.
8.3. Added a "Data Source Settings" panel to the top of `admin.html` (admin-only) with editable URL fields for
     both pointers, plus Save and Reset-to-defaults actions — this is the switch the request asked for so the
     Market Database and Contributors links can be edited/swapped without a code change.
8.4. `app.js` — added `applyDataSourceLinks()`, called on `index.html` load, which points the "Market Database"
     and "Contributors" ecosystem cards and the "Contributor guidelines" link at whatever `SiSettings.get()`
     currently holds, so an admin's saved change is reflected across the site immediately (same browser).
8.5. `contributions.js` — added `getOrCreateAnonymousId()`, which generates a random per-browser pseudonymous ID
     (`anon-xxxxxxxx`, stored in `localStorage` under `si_anon_id`) the first time someone contributes signed out,
     instead of a flat literal `"Anonymous"`. Submissions now carry an explicit `isAnonymous` flag rather than
     inferring it from the contributor string.
8.6. `contribute.html` shows the visitor their anonymous ID before submitting, so it's clear it's a stable
     per-browser handle, not a real identity.
8.7. Deliberately did **not** implement IP-based identification: this is a static site with no server, so there
     is nothing server-side to read a real client IP from, and client-side IP lookups (e.g. via a third-party API)
     would silently leak visitor IPs to an external service and violate the "no PII" whitelist rule in
     `DEV-GUIDE.md` §2. `admin.html` now documents this explicitly under "Contributor Identity" and defers any
     real IP-based trust/dedup to the backend in Phase 5 (`silicon-index-backend-api`), where it can be done
     server-side without exposing IPs to the client.

## Phase 9 — Admin-Configurable Donation / Payment Links (client-side demo, done)

9.1. Fixed the "Donations API" ecosystem card (`index.html`) and README table to link to
     [`silicon-index-donations-api.github.io` `dev` branch](https://github.com/silicon-index/silicon-index-donations-api.github.io/tree/dev)
     instead of the GitHub Pages URL — same reason as 7.1/8.1: that repo has Pages disabled and only contains a
     stub `README.md`/`LICENSE`.
9.2. `settings.js` — extended `SiSettings` with `donationsApiUrl` plus four payment-link fields:
     `githubSponsorsUrl`, `paypalUrl`, `customDonationLabel`, `customDonationUrl`. Rewrote `get`/`set` to
     distinguish an unset field from an intentionally-cleared empty string, since blank now means "hide this
     button" rather than "keep the previous value."
9.3. Added the payment-link fields to the "Data Source Settings" panel in `admin.html` — GitHub Sponsors URL,
     PayPal/other URL, and a custom label+URL pair, each optional. The panel explains this site never collects
     payment details itself; it only links out to whatever processor is configured.
9.4. Added a "Support Silicon Index" panel to `index.html` plus a "♥ Support" shortcut in the top nav
     (`#support-panel`). `app.js`'s `renderSupportLinks()` builds one button per non-empty configured link and
     shows an empty-state message when none are set.
9.5. Noted the architectural limit explicitly: because there is no backend yet, `si_settings` lives in
     `localStorage`, so a payment link an admin configures only takes effect in that same browser — it does not
     propagate to other visitors. Making a configured link show up site-wide for every visitor requires Phase 5's
     real backend (`silicon-index-backend-api`) to serve `si_settings` from a shared store instead of the browser.

## Phase 10 — Astro + TypeScript + Tailwind + uPlot Rewrite (done)

Item 1. Retired the hand-rolled vanilla HTML/CSS/JS site into `legacy-static/` (kept for reference/rollback, not
        built or deployed) and scaffolded a fresh Astro project at the repo root: `package.json`,
        `astro.config.mjs` (`output: "static"`), `tsconfig.json` (`astro/tsconfigs/strict`), `tailwind.config.mjs`
        with the existing dark palette ported into Tailwind's theme tokens.
Item 2. Added `.github/workflows/deploy.yml` — a GitHub Actions workflow that runs `npm ci && npm run build` on
        push to `main` and deploys `dist/` via `actions/deploy-pages`. This is a required change, not optional:
        plain "Deploy from a branch" GitHub Pages cannot run an Astro build, so the repo's Pages source must be
        switched to "GitHub Actions" in repo settings for this to take effect.
Item 3. `src/lib/types.ts` — TypeScript data contracts: `ComponentEntry`/`PricePoint` (hardware price entries with
        history), `ContributionEntry`, the `AnonymousContributorProfile` / `TrustedContributorProfile` discriminated
        union (`ContributorProfile`), `UserRecord`/`Session`, and `SiteSettings`.
Item 4. `src/lib/dataService.ts` — the decoupled data service layer. `fetchMarketData()` attempts
        `raw.githubusercontent.com/.../silicon-index-market-database.github.io/dev/data/market-data.json` first,
        then falls back to the bundled `/mock-data.json` on any network error or non-2xx status.
        `fetchContributors()` attempts the equivalent raw path on the contributors repo, then falls back to the
        locally computed contributors index. As documented inline: every sibling repo was re-verified via the
        GitHub API to contain only a stub README/LICENSE with Pages disabled, so both raw fetches 404 today and
        every call currently resolves from the fallback — expected, and requires no code change once those repos
        publish real data at those paths.
Item 5. `src/lib/auth.ts`, `src/lib/contributions.ts`, `src/lib/settings.ts` — full TypeScript ports of the prior
        `auth.js`/`contributions.js`/`settings.js`, same `localStorage` keys and behavior (SHA-256 password
        hashing, anonymous pseudonymous IDs, admin-editable data-source/donation-link settings), now type-checked
        against the Item 3 contracts.
Item 6. `src/components/PriceChartModal.astro` + `src/lib/chartModal.ts` — a `uPlot`-backed chart drawer. Clicking
        any screener row opens a modal rendering that component's 12-month `priceHistory` as a canvas line chart
        (points + fill), replacing the plain-table-only view from the vanilla site.
Item 7. `src/components/ScreenerTable.astro` — the filter sidebar + market table, ported from `app.js` to
        TypeScript, now sourced through `fetchMarketData()` (with a small badge indicating whether data came from
        the remote endpoint or the local fallback) and wired so each row opens the Item 6 chart modal.
Item 8. `src/components/{EcosystemGrid,CommunityPanel,ContributorsPanel,SupportPanel}.astro` — ports of the
        equivalent vanilla sections, each still reading/writing the same `localStorage` state so admin
        configuration and community submissions carry over conceptually (existing browser data isn't migrated
        automatically since the storage schema is unchanged but the reading code moved to TS islands).
Item 9. `src/pages/{index,login,contribute,admin}.astro` — one Astro page per prior HTML file, assembled from the
        Item 8 components inside `src/layouts/BaseLayout.astro` (Tailwind-based header/footer, session-aware nav
        slot that calls `ensureDemoAdmin()` before any page's own script queries `getSession()`).
Item 10. Verified end-to-end with `npx astro check` (0 errors) and `npx astro build`, then served `dist/` locally
         and confirmed all four routes (`/`, `/login/`, `/contribute/`, `/admin/`) and both JSON assets
         (`/mock-data.json`, `/contributors-index.json`) return 200.

## Phase 11 — Centralized Multi-Repo Navigation Config (done)

Item 11. Fixed a modal bug reported against Phase 10's chart drawer: `.chart-modal-backdrop` declared
         `display: flex` unconditionally, which ties with the UA stylesheet's `[hidden] { display: none }` on
         specificity and wins on source order — so `backdrop.hidden = true` never visually closed the modal.
         Added an explicit `.chart-modal-backdrop[hidden] { display: none; }`. Audited every other
         `hidden`-toggled element (`.empty-state`, `.form-error`, `.form-success`, `#admin-denied`,
         `#admin-content`, `#support-empty`); none declare their own `display`, so none were affected.
Item 12. Added `src/config/navigation.ts` — the single source of truth for external ecosystem routing, exporting
         the `NavItem` interface and the `DEV_ECOSYSTEM_NAV` array (Contributors Hub, Database Schemas, Market
         Scrapers, AI Models, Security Portal, Admin Dashboard) with `title`/`href`/`isExternal`/`badge` fields.
Item 13. Extended `NavItem` with an explicit fallback contract (`fallbackHref`, `pagesDeployed`) plus
         `resolveNavHref()` and `isFallingBack()` helpers. This satisfies the "graceful local fallbacks"
         requirement for the two entries whose specified `silicon-index.github.io/<repo>` Pages URLs are dead:
         both `silicon-index-security.github.io` and `silicon-index-admin-dashboard.github.io` report
         `has_pages: false` via the GitHub API and hold only a stub README/LICENSE. The intended Pages URL is
         retained in `href` so it becomes live by flipping `pagesDeployed` to `true`; until then visitors are
         routed to the repo's `dev` branch and the link is tagged with a "dev fallback" badge.
Item 14. Added `src/components/EcosystemNav.astro`, a single config-driven component with three variants so the
         URLs are never duplicated across placements: `header` (accessible dropdown — `aria-expanded`,
         click-outside and Escape to close), `footer` (inline separated link row), and `quick` (quick-links strip
         rendered above the ecosystem grid on the homepage).
Item 15. Wired the component into `src/layouts/BaseLayout.astro` (header nav + footer, so it applies to all four
         pages) and `src/components/EcosystemGrid.astro` (quick links).
Item 16. Caught and fixed a build-time bug while verifying Item 14: the dropdown's `<script>` had been nested
         inside a `{variant === "header" && (...)}` expression, and Astro only hoists `<script>` tags it finds
         statically — so it was silently dropped from the bundle and the dropdown could never open. Moved the
         script to the component's top level with runtime null guards; confirmed
         `dist/_astro/EcosystemNav.astro_astro_type_script_index_0_lang.*.js` is now emitted.
Item 17. Verified: `npx astro check` 0 errors, `npx astro build` clean, and the built `dist/index.html` renders 6
         menu items + 6 quick links, 4 "dev fallback" badges, zero occurrences of either dead Pages URL, and the
         `/tree/dev` fallbacks in their place. `.ecosystem-menu[hidden]` also got an explicit `display: none` so
         the dropdown doesn't repeat the Item 11 bug.

## Phase 12 — Admin-Managed Ecosystem Navigation (done)

Item 18. Gave every `NavItem` a stable `id` and added a `settingsKey` field. `contributors-hub` and
         `database-schemas` describe the same targets as the existing `contributorsUrl` / `marketDbUrl` data
         sources, so they are linked to those fields rather than duplicated — one admin control per concept, no
         chance of the ecosystem cards and the nav links drifting apart.
Item 19. Extended `SiteSettings` with `navOverrides: Record<string, string>` and
         `navPagesDeployed: Record<string, boolean>`, and reworked `src/lib/settings.ts` to handle map-valued
         fields (the previous `get`/`set` assumed every field was a string). Both maps are sanitized on read and
         write, so malformed `localStorage` content can't inject non-string hrefs.
Item 20. Added `resolveNavHrefWithSettings()` / `isFallingBackWithSettings()` to `src/config/navigation.ts`.
         Precedence: explicit admin override → linked data-source setting → admin-toggled Pages-deployed flag →
         static fallback contract → the item's own `href`.
Item 21. Added an "Ecosystem Navigation" panel to `src/pages/admin.astro`: a URL field per route (blank = use the
         built-in default) plus a "Pages site is live" checkbox for the two entries that have a fallback, with
         Save and Clear-overrides actions. Saving a linked entry writes through to its data-source field and
         re-renders the Data Source Settings form above so both stay consistent.
Item 22. `src/components/EcosystemNav.astro` now tags every rendered anchor with `data-nav-id` (18 anchors: 6
         routes × header/footer/quick) and rewrites `href`, `title`, and the "dev fallback" badge client-side from
         saved settings. Pages stay prerendered with the static defaults, so the zero-JS baseline still yields
         working links before hydration.
Item 23. Verified the resolution logic with assertions run against the real module (via `vite-node`), not by
         inspection: default → dev fallback; `pagesDeployed: true` → the specified Pages URL; explicit override
         beats both; a linked entry follows `contributorsUrl`; plain entries keep their static `dev` href; and no
         item ever resolves empty. 8/8 passed. `astro check` 0 errors, build clean, admin page renders 6 URL
         inputs + 2 checkboxes.
Item 24. Caveat unchanged from Phase 9.5: `si_settings` is `localStorage`, so navigation overrides an admin saves
         apply only in that browser. Site-wide navigation config needs the Phase 5 backend to serve settings from
         a shared store.

## Phase 13 — Canonical Service Layer, Moderation & Auto-Accept Engine (done)

Item 25. Added `src/services/dataService.ts` as the single canonical data layer, replacing the interim
         `src/lib/dataService.ts`. Models: `HardwareComponent` (SKU, MSRP, median market price, `fairValueScore`,
         `historicalPrices` as `[timestamp_ms, price][]`), `ContributorProfile` (contributor id, tier, trust
         score, verified submissions), and `PriceSubmission` (submission id, SKU, reported price, currency, proof
         URL, `pending | approved | denied | flagged`, contributor tier, timestamps).
Item 26. Service methods: `fetchMarketData()` and `fetchContributors()` both try the repo's raw `dev` endpoint and
         fall back automatically on network error, offline, or any non-2xx (404/403 included); each returns
         `{ data, origin, reason }` so the UI can show which source it rendered. `stageSubmission(entry)` stages
         locally in `localStorage`. `fetchMarketData()` accepts either the normalized or the raw upstream shape,
         so the market-database repo can publish either.
Item 27. Added `msrp` to every entry in `public/mock-data.json` (and the legacy copy) — the previous dataset had
         no MSRP field, only `fairValueScore` (a computed index) and `marketPrice`. `toHardwareComponent()` adapts
         the raw file into the model, mapping `marketPrice → medianMarketPrice` and `priceHistory → tuples`.
Item 28. Deleted the superseded `src/lib/contributions.ts` and its `ContributionEntry` /`ContributorProfile` types
         from `src/lib/types.ts` rather than leaving two competing submission models in the tree. Anonymous id
         generation moved to `src/lib/identity.ts`.
Item 29. `readStaged()` migrates records written by the pre-service schema (`observedPrice`, `contributor`,
         `isAnonymous`, status `rejected`) into `PriceSubmission`, so browsers holding existing demo submissions
         don't lose them on upgrade. Verified with 13 assertions, including idempotency.
Item 30. Added `src/lib/moderation.ts`: `approve()`, `deny(reason)` with a `DENIAL_REASONS` tag list,
         `flag()` for anomaly review, `reopen()`, plus `getReviewQueue()` (pending + flagged) and `getReviewed()`.
Item 31. Auto-Accept Engine — `evaluateAutoAccept()` in the service returns a full decision record
         (`accept`, `movingMedian`, signed `deviation`, human-readable `reason`); `runAutoAcceptEngine()` applies
         it across the pending queue. Approves ONLY when the contributor tier is `trusted` AND the reported price
         is within ±15% of that SKU's historical moving median. Anonymous contributors, unknown SKUs, and empty
         series are never auto-accepted — an unknown component is exactly what a human should see.
Item 32. Rebuilt the Admin Panel review UI: a Submission Review Queue showing reported price against the moving
         median and live deviation %, contributor tier badge, and per-row Approve / Flag / Deny-with-reason /
         Schema actions; a "Run Auto-Accept Engine" button reporting how many were accepted and why the rest were
         skipped; and Reviewed History with the decision note, an `auto` marker, and Reopen.
Item 33. Added `toContributorSchema()` + a "Submission Schema Preview" panel rendering the standardized JSON for
         any selected submission — whitelist-only per DEV-GUIDE.md §2 (normalized `component_id`, numeric
         `price_amount`, ISO currency/timestamp, categorical `source_type`), carrying no contributor PII beyond
         the pseudonymous id and tier.
Item 34. `buildContributorRegistry()` derives `ContributorProfile`s from submission history; trust score is
         approved / (approved + denied + flagged) as 0–100, and a contributor with nothing reviewed scores 0
         rather than a misleading 100. The Contributors panel now renders tier, trust score, and verified count
         via `fetchContributors()`.
Item 35. Extracted `src/components/Header.astro` and `src/components/Footer.astro` out of `BaseLayout.astro`,
         matching the requested project structure; both consume the Phase 12 `EcosystemNav`.
Item 36. Verified with assertions run against the real modules (via `vite-node`), not by inspection: 26/26 on the
         service layer — including ±15% boundary cases at exactly +15%/-15% (accept) vs +15.1% (reject), anonymous
         never auto-accepted even at the exact median, unknown SKU and empty series rejected, trust-score maths,
         schema payload shape, and the raw→model adapter — plus 13/13 on legacy migration. `astro check` 0 errors
         across 25 files, build clean, and the moderation controls confirmed present in the emitted bundle.
Item 37. Not done, deliberately: the workspace tree in the brief shows sibling folders
         (`silicon-index-contributors/`, `silicon-index-market-database/`, …) beside this repo. Those are separate
         GitHub repositories, not directories of this one — creating them here would commit stub copies of other
         repos into the frontend. The decoupling is handled by raw-URL fetching plus fallbacks (Item 26) exactly
         as the brief's integration section specifies.

## Phase 14 — Module Registry & Contract Stubs (done)

Item 38. Reworked `src/config/navigation.ts` to the requested `NavModule` shape — `ECOSYSTEM_MODULES` keyed by
         id, with `title`, `description`, `remoteDevUrl`, `localStubPath`, `badge`, `isExternal` — plus
         `getModuleNavList()` and `resolveModuleHref()`. `DEV_ECOSYSTEM_NAV` is kept as a derived alias so the
         existing nav components and the admin editor keep working unchanged.
Item 39. Retained the Phase 12 fallback contract (`fallbackHref` / `pagesDeployed`) on top of the new shape.
         The brief's `resolveModuleHref(id, fallbackToLocal)` would otherwise have fallen back to
         `localStubPath` values like `/src/modules/contributors`, which are source paths and not served routes —
         they would 404 in a static build. `localStubPath` is therefore documented and typed as a repo-relative
         docs pointer that is never used as an href; the href fallback stays the `/tree/dev` URL. Asserted in
         tests that no `localStubPath` starts with `/`.
Item 40. `admin`'s fallback is `/admin` — this portal ships its own working moderation console, so that is a
         genuinely useful local fallback rather than a dead end. `security` still falls back to its `dev` branch.
Item 41. Surfaced the new `description` field: the header dropdown now renders a title row plus a one-line
         module description, quick links use it as their tooltip, and the Admin Panel's navigation editor shows
         it as help text above each URL field.
Item 42. Created `src/modules/{contributors,database,scrapers,ai,security,admin}/` with a README per module
         (target repo, branch, nav id, purpose) and a top-level `src/modules/README.md` explaining the boundary.
Item 43. `src/modules/contributors/contracts.ts` and `src/modules/database/schemas.ts` define the modules'
         **upstream wire contracts** with adapters to/from the canonical model, rather than re-declaring
         `PriceSubmission` / `HardwareComponent` as parallel copies. Forking those models is what Item 28 removed;
         an explicit upstream-vs-internal boundary keeps a schema change absorbed in one adapter. Real differences
         are captured: upstream `submittedAt` is an epoch number vs the portal's ISO string, and upstream splits
         `brand`/`model` and dates by `releaseDate` rather than `releaseYear`.
Item 44. Verified with 17 assertions against the real modules (`vite-node`): submission round-trip
         internal → wire → internal preserves the ISO timestamp through the epoch conversion, the database
         adapter joins brand+model and derives `releaseYear` from `releaseDate`, and the navigation API returns
         the expected hrefs including the unknown-id `"#"` case. `astro check` 0 errors across 27 files, build
         clean, dropdown renders 6 descriptions, and zero `/src/` paths or dead Pages URLs appear as hrefs.
Item 45. **Correction, and a correction to that correction.** I first read `gh auth status` (authenticated) and
         `gh api repos/silicon-index/<repo>` reporting `push: true, admin: true`, and told the user the brief's
         "no Git tokens" premise was wrong. That was itself wrong, and the write attempt proved it: pushing to a
         sibling repo returns `403 Resource not accessible by integration`. The `permissions` block in the repo
         JSON describes the **user account's** rights on that repo, not what this **token** may do — the
         Codespaces `GITHUB_TOKEN` (a `ghu_` user-to-server token) is scoped to the current repository only.
         Verified end to end: write to a sibling repo → 403; read a sibling repo → OK; `git push --dry-run` on
         this repo → accepted. So the brief was substantially right for writes, and the stub-folder approach in
         Phase 14 is the correct workaround, not a detour around an imaginary constraint. Lesson recorded: repo
         `permissions` is not a token capability check — only an actual write attempt is.
Item 46. Added `scripts/sync-modules.sh` so the sync runs from a terminal with the user's own credentials, which
         do carry cross-repo write access. It regenerates `market-data.json` from `public/mock-data.json` using
         the same adapter the portal uses, clones each target repo's `dev` branch to a temp dir, writes
         `data/` payloads plus documentation, and commits/pushes. Defaults to a dry run; needs `--push` to
         actually publish, and reports what it would do either way.
Item 47. Seeded payloads are labelled honestly at the source: `data/README.md` in the market-database repo states
         in bold that the prices are sample/mock values and must not be cited as observed market pricing, and the
         contributors registry ships as `[]` on purpose — trust scores are earned via admin approval, and seeding
         invented contributors would put fabricated trust metrics in front of users.
Item 48. Related honesty fix in the portal: the screener's source badge read "● live market-database" whenever a
         fetch resolved remotely. Once that repo publishes seed data, that phrasing would imply real market
         pricing. It now names the source without vouching for the data — "● market-database (dev)" vs
         "● local sample data".

## Phase 15 — Terminal Header Restyle (done)

Item 49. Restyled `src/components/Header.astro` to the requested zinc/emerald terminal look (sticky, backdrop
         blur, `max-w-7xl` shell, `SILICON_INDEX[dev]` monospace wordmark) while keeping every existing feature:
         the Screener/Contribute/Support links, the Ecosystem dropdown, and the session-aware auth slot
         (sign in → username + role chip → sign out, plus the Admin link for admins).
Item 50. The brief's `HeaderNav.astro` rendered the six ecosystem links inline; with three internal links and the
         auth slot also in the bar that does not fit, so they stay in the accessible dropdown from Phase 12,
         restyled to match (zinc surfaces, emerald badges). New `.term-*` classes were added rather than
         overwriting the existing design tokens, so the rest of the site is untouched.

## Phase 16 — CI Sync Workflow (done)

Item 51. Made `scripts/sync-modules.sh` token-aware so it runs in CI as well as locally. The brief's workflow
         exported `GH_TOKEN` and called the script directly — that would not have worked: the script uses plain
         `git clone`/`git push`, and `GH_TOKEN` is read by the `gh` CLI, not by git. The clone would have
         succeeded (public read) and the push would then have failed on auth.
Item 52. The token is wired into git through a temporary credential helper that reads it from the environment,
         rather than embedding it in the remote URL. It therefore never appears in a URL, in argv, or in output.
         Verified: helper emits the correct `username`/`password` pair for `get`, stays silent for `store`, and a
         full dry run with a known token value contains 0 occurrences of it.
Item 53. Added git identity setup per-clone (`SYNC_GIT_NAME`/`SYNC_GIT_EMAIL`, defaulted). CI runners have no
         global `user.name`/`user.email`, so the commit would otherwise have failed after all the work was done.
Item 54. Added `.github/workflows/sync.yml`. Changes from the brief's version, each for a reason:
         - `paths:` filter so the sync only fires when `public/mock-data.json` or the sync tooling actually
           changes. Running it on *every* push to `dev` means every unrelated commit rewrites data in two other
           repositories.
         - `workflow_dispatch` with a `dry_run` input defaulting to **true**, so a manual run previews by default.
         - `permissions: contents: read` — the job writes nothing to this repo.
         - `persist-credentials: false` on checkout, so the repo-scoped default token is not left wired into git
           config while the script authenticates its own clones.
         - A preflight step that fails with a clear message when `SYNC_TOKEN` is missing, instead of failing
           opaquely at push time.
         - `concurrency` group so two syncs cannot race on the same target repos.
Item 55. Documented least privilege in the workflow header: a fine-grained PAT scoped to just the two target
         repos with "Contents: Read and write" is sufficient. A classic `repo`-scope PAT also works but grants
         far more than this task needs.
Item 56. Verified: both workflow files parse as valid YAML, the script passes `bash -n`, the dry run completes
         end to end (545 + 32 insertions staged), and the token code path activates and stays quiet.

## Phase 17 — Sorted the Project Into Modules (done)

Item 57. Reorganised the portal by ecosystem module. `src/modules/<id>/` no longer holds only wire-contract
         stubs — each now owns the portal-side logic for its domain, so the folder structure mirrors the
         multi-repo architecture instead of describing it.
Item 58. Moved the canonical models (`HardwareComponent`, `PriceSubmission`, `ContributorProfile`,
         `PricePointTuple`, `ContributorTier`, `SubmissionStatus`) out of `services/dataService.ts` into
         `src/lib/types.ts`, which imports nothing. This is what makes the split possible: every module shares
         the same types without importing another module, so no cycle can form.
Item 59. `src/modules/ai/engine.ts` — `median()`, `evaluateAutoAccept()`, `AUTO_ACCEPT_TOLERANCE`, extracted from
         the service. Fair-value and anomaly rules now sit in the module that mirrors `silicon-index-ai`.
Item 60. `src/modules/contributors/` — gained `registry.ts` (trust-score derivation, `ContributorSchemaPayload`,
         `toContributorSchema`) and `identity.ts` (moved from `lib/`), alongside the existing `contracts.ts`.
Item 61. `src/modules/database/adapters.ts` — `toHardwareComponent()`, `normalizeSku()`,
         `isHardwareComponentArray()`, extracted from the service, alongside the existing `schemas.ts`.
Item 62. `src/modules/admin/moderation.ts` — moved from `lib/moderation.ts`; now imports the accept rules from
         `modules/ai/engine.ts` rather than from the service.
Item 63. `services/dataService.ts` slimmed to transport and storage only: the two raw endpoints, the fallback
         logic, `stageSubmission`, the staging store, and the legacy-schema migration. It composes the modules
         (`database/adapters`, `contributors/registry`) and re-exports the models as a facade so the boundary
         stays convenient to consume.
Item 64. Updated every import site to reference the owning module rather than the facade, so the dependency
         direction is visible at each call site (`@/modules/ai/engine`, `@/modules/admin/moderation`,
         `@/modules/contributors/identity`, `@/modules/database/adapters`, `@/lib/types`).
Item 65. Verified the structure holds, not just that it compiles: a script walks every `.ts` import edge and
         does a DFS cycle check — **no import cycles**, with modules depending only on `lib/types`,
         `modules/ai/engine`, and the service. Kept presentation (`components/`, `pages/`, `layouts/`) out of
         the modules; the rule is modules own domain logic and contracts, components compose them.
Item 66. Re-ran the full behavioural suite against the new locations to prove the move changed nothing: 20/20 —
         ±15% boundary cases, anonymous-never-auto-accepted, trust-score maths, SKU normalization, the
         adapter tuples, legacy-submission migration, the moderation queue, the contracts round-trip, and the
         navigation resolver. `astro check` 0 errors across 30 files; build clean.
Item 67. Rewrote `src/modules/README.md` with the layout table, the dependency rule (including the one permitted
         cross-module edge, `admin/moderation → ai/engine`), and the contract-vs-canonical-model distinction;
         each module README gained an "Owns (portal-side)" section listing its exports.

## Phase 18 — Module Contracts & Enforced Decoupling (done)

Item 68. Every module now carries a `contracts.ts` of pure TypeScript types, an implementation where it owns
         one, and its own `README.md`. The two modules that previously had documentation only — `scrapers/` and
         `security/` — now have real contracts.
Item 69. `database/contracts.ts` — `HardwareComponent` (SKU, MSRP, median price, `historicalPrices`),
         `PricePointTuple`, the raw `ComponentEntry` shape, and validation models (`FieldConstraint`,
         `HARDWARE_CONSTRAINTS`, `ValidationResult`).
Item 70. `contributors/contracts.ts` — `ContributorTier` (`anonymous` | `trusted`), `ContributorProfile`,
         `PriceSubmission`/`NewSubmissionInput`, the verification schema (`VerificationCheck`,
         `REQUIRED_VERIFICATION_CHECKS`, `VerificationResult`), `TRUST_TIER_SPEC`, the outbound
         `ContributorSchemaPayload`, and the upstream `ContributorSubmission` wire shape with adapters both ways.
Item 71. `scrapers/contracts.ts` — `IngestionPayload` plus `PERMITTED_INGESTION_FIELDS`, encoding DEV-GUIDE.md §2
         as types: seller names, free text, and locations are not *representable* in the payload, so the
         whitelist is enforced by the type rather than merely documented. Also `SourceType`,
         `STRIPPED_QUERY_PREFIXES`, the store whitelist (`WhitelistedStore`, with `rateLimitMs` and
         `respectsRobotsTxt: true` as contractual per §4), and the sanitization pipeline — where a rejected
         record yields no payload at all, since partial ingestion should not be possible.
Item 72. `ai/contracts.ts` — `FairValueInput`/`FairValueOutput`, `AnomalyDetectionInput`/`Output`, `AnomalyKind`,
         `AutoAcceptDecision`, and the `FairValueScorer`/`AnomalyDetector`/`AutoAcceptEvaluator` interfaces.
         `engine.ts` gained `detectAnomaly()` so the anomaly contract is implemented, not just declared.
Item 73. `security/contracts.ts` — `AdvisoryPayload` (`SI-YYYY-NNN`, severity, CVSS, `AffectedModule[]`),
         `IncidentReport`, and `DisclosurePolicy`. A reporter is a pseudonymous handle or `null`; there is
         deliberately no email, IP, or location field, consistent with the no-PII rule applied elsewhere.
Item 74. `admin/contracts.ts` — `SubmissionStatus` (owned here because its states are moderation outcomes),
         `ModerationAction`, `DENIAL_REASONS`, `ModerationDecision`, and `AutoAcceptRuleSpec` +
         `AUTO_ACCEPT_RULES`. The ±15% rule set is now inspectable data; `engine.ts` reads its tolerance from it,
         so the rule has exactly one definition instead of a duplicated literal.
Item 75. Inverted the ownership of the canonical models: they moved out of `src/lib/types.ts` into the module
         that owns them, and `lib/types.ts` became a **re-export facade**. Direction is one-way — `lib/types`
         imports from `modules/*`, never the reverse.
Item 76. Contracts are layered to stay acyclic: layer 0 (`admin`, `database`, `scrapers`, `security`) imports
         nothing; layer 1 (`contributors`, `ai`) imports layer 0 type-only; implementations sit above.
Item 77. Added the `@modules/*` alias with a single source of truth: `aliases.mjs` is imported by
         `astro.config.mjs` and the new `vite.config.mjs`, and mirrored in `tsconfig.json` `paths`. App code
         (`services/dataService.ts`, pages, components) now imports contracts from `@modules/*` rather than
         inline or facade types.
Item 78. Added `scripts/check-architecture.mjs`, run via `npm run check:arch` (and `npm run check` alongside
         `astro check`), wired into `deploy.yml` so the build is gated on it. It enforces the two invariants
         TypeScript will not catch: every `contracts.ts` is free of runtime imports, and the whole `src/` import
         graph is acyclic (tsc compiles cycles happily; they fail at runtime as undefined bindings).
Item 79. Verified the guard by breaking it on purpose — added a runtime import to `security/contracts.ts` and
         confirmed it fails with exit 1 and names the file, then restored and confirmed it passes. A check that
         has never failed is not known to work.
Item 80. Full verification: `astro check` 0 errors across 35 files, architecture check passes (19 files scanned,
         6 contracts pure, no cycles), production build clean, and the behavioural suite re-run at 29/29 —
         including the new anomaly-detector cases and assertions that the engine's tolerance matches the
         contract's rule spec.

## Phase 19 — uPlot Price History Drawer (done)

Item 81. Added `src/lib/priceChart.ts` — a thin uPlot wrapper themed to the terminal/zinc aesthetic: emerald
         (`#34d399`) price line with a translucent fill, zinc-800 (`#27272a`) grid and ticks, monospace axis
         labels, currency-formatted y-axis, and a live legend. Deliberately thin — uPlot's value is its
         zero-overhead canvas rendering, so the wrapper adds theming and data mapping and nothing else.
Item 82. `toUplotSeries()` maps the contract's `PricePointTuple[]` into uPlot's parallel-array format, handling
         two things that would otherwise render silently-wrong charts: the contracts carry **milliseconds** while
         uPlot's time scale works in **seconds**, and uPlot requires x ascending, so the series is sorted rather
         than trusting the caller. Non-finite pairs are dropped so one bad observation can't break the plot.
Item 83. Named the wrapper's parameter `observations` as the brief specifies. Note the contract field on
         `HardwareComponent` is `historicalPrices`; `observations` is the field name on `HardwarePriceSeries` in
         `database/schemas.ts`. The parameter name reconciles the two without inventing a field on the contract.
Item 84. Added `src/components/PriceDrawer.astro` (markup) and `src/lib/priceDrawer.ts` (behaviour) — a right-hand
         sliding drawer replacing the previous centred modal. Shows the component name, SKU, and a stat grid
         (median market price, MSRP, fair value, spec, TDP), with the median tinted when it sits above fair value.
Item 85. Accessibility, since the drawer is a dialog and table rows are now interactive: `role="dialog"` +
         `aria-modal`, focus moved to the close button on open and restored to the invoking row on close, Tab
         trapped inside the panel, Escape and scrim-click to close, and rows given `tabindex="0"`, `role="button"`
         and an `aria-label` so they are operable by keyboard, not mouse only.
Item 86. `.drawer[hidden] { display: none }` is declared explicitly — the same trap fixed in Item 11: a
         class-level `display` ties with the UA `[hidden]` rule on specificity and wins on source order, so the
         attribute alone would not hide it. The slide transition is disabled under `prefers-reduced-motion`.
Item 87. Chart width is measured from the panel and kept correct by a `ResizeObserver` plus a window resize
         listener; the chart instance is destroyed on close so no canvas or observer leaks across opens.
Item 88. Removed the superseded `lib/chartModal.ts` and `components/PriceChartModal.astro`; verified zero
         references to either remain in the built output.
Item 89. Verified the data path against the real dataset rather than by inspection: 13/13 assertions covering
         ms→s conversion, unsorted input being sorted, NaN/Infinity dropped, parallel arrays staying aligned,
         and `mock-data.json → toHardwareComponent → toUplotSeries` producing 12 ascending points per component
         whose y-values match the source file — plus the theme constants being the requested palette.
Item 90. `npm run check` passes (architecture: 20 files scanned, 6 contracts pure, no cycles; `astro check`:
         0 errors across 36 files). Build clean; the drawer markup ships hidden by default, and the page plus
         every referenced asset serves 200.
Item 91. **Not verified: the visual result.** There is no browser or driver in this environment, so the chart has
         not been rendered — only its data mapping, bundling, and markup were checked. The drawer needs a click
         through in a real browser before it is called done.

## Phase 20 — Hybrid Server + Serverless Module APIs (done)

Item 92. Added WinterCG entry points `src/modules/{database,ai,scrapers}/api.ts`: standard `Request` in,
         standard `Response` out, upstream read with standard `fetch`. No `node:*` builtins, no npm
         dependencies, no filesystem, no framework — so the identical file runs on Node, Bun, Deno, and
         Cloudflare Workers. Each exports both `handleRequest` (for direct testing) and
         `default { fetch }` (the Workers contract).
Item 93. Imports inside `api.ts` are deliberately RELATIVE, never the `@modules/*` alias — wrangler and Bun
         resolve relative specifiers with no extra configuration, and an alias would only work in the Astro
         build.
Item 94. Added `src/lib/http.ts`: runtime-agnostic helpers (JSON responses, RFC-style errors, body parsing,
         CORS + preflight, and an error boundary so an unexpected throw returns JSON rather than a
         runtime-specific HTML page). It imports nothing, so vendoring it with a module at split time is a copy.
Item 95. Implemented what the APIs needed, since three contracts had no implementation:
         `database/validate.ts` (validates against `HARDWARE_CONSTRAINTS`, collecting every issue rather than
         failing on the first), `scrapers/sanitize.ts` (enforces the §2 whitelist at runtime; a rejected record
         yields no payload at all, so partial ingestion is impossible), and `ai/engine.ts#scoreFairValue`
         (completing `FairValueScorer`).
Item 96. Dual deployment per module: `deploy/<module>/Dockerfile` (Bun on Alpine, non-root, `HEALTHCHECK`
         against the handler's own `/health`) and `deploy/<module>/wrangler.toml` pointing `main` at the same
         `api.ts`. `deploy/<module>/server.ts` is the only runtime-specific file in the whole deployment — a
         five-line `Bun.serve` bootstrap. No `nodejs_compat` flag anywhere: if one were needed, the handler
         would have stopped being portable.
Item 97. Extended `scripts/check-architecture.mjs` with a third invariant — every `api.ts` must be free of
         `node:*` builtins, npm dependencies, and path aliases. A Node import type-checks fine and then fails
         only once deployed to Workers, which is far too late to discover it.
Item 98. Verified the guard by breaking it three ways on purpose (Node builtin, npm dependency, alias import),
         confirming each is caught with a specific message, then restoring.
Item 99. Verified the handlers directly — being plain functions, they need no server: 34/34 assertions across
         all three modules, covering happy paths, 404/405/415/400/422 error paths, CORS preflight and restricted
         origins, upstream normalization, and the security-relevant rejections (a PII field, a stringified
         price, an unwhitelisted store).
Item 100. Verified the container path for real rather than by inspection: built the image with Docker, ran it,
          and got correct live responses from `/health` and `/score`; Docker reported the `HEALTHCHECK` as
          `healthy` (exit 0); all three images build; final image ~132 MB with no `node_modules`.
Item 101. Verified Workers portability as far as is possible without deploying: `esbuild --platform=neutral`
          bundles all three handlers cleanly, which fails if any Node builtin is reachable. **Not verified: an
          actual `wrangler deploy`** — that needs Cloudflare credentials this environment does not have.
Item 102. Behaviour worth keeping: `database` returns **502 with the upstream URL** when the market-database
          repo has published nothing, rather than an empty list that would look like real data. Confirmed live
          from the running container against the real (still unpublished) upstream.
Item 103. The API code is tree-shaken out of the portal bundle — confirmed zero API strings in `dist/_astro`.
          `npm run check` passes (26 files, 6 contracts pure, 3 handlers portable, no cycles; 0 type errors
          across 42 files) and the site build is clean.
