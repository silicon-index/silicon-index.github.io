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
