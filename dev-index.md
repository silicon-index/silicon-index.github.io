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

## Phase 3 — Community Ingestion Form

3.1. Form UI — dropdown-only spec fields (Socket, Generation, Memory Type); no free-text spec inputs
3.2. Numeric-only inputs — Observed Price, TDP (with min/step validation)
3.3. Mandatory URL input — "Proof of Value" (link to completed transaction)
3.4. Client-side validation against the strict whitelist rule (see DEV-GUIDE.md §2)
3.5. Submission stub — POST payload shape matching future backend API contract

## Phase 4 — Trust Factor System

4.1. Trust Score badges — Pending Validation, Trusted Contributor, Flagged
4.2. Badge placement next to community-submitted price rows/entries
4.3. Visual tiering (icon + color) without exposing contributor PII

## Phase 5 — Backend Integration

5.1. Replace `mock-data.json` fetch with calls to `silicon-index-backend-api`
5.2. PostgreSQL schema mapping for component specs (static, immutable)
5.3. TimescaleDB hypertable integration for price history time-series
5.4. Fair Value Score computed server-side by the valuation engine (`silicon-index-ai`)

## Phase 6 — Hardening & Polish

6.1. Accessibility pass (keyboard nav, ARIA labels, contrast audit)
6.2. Performance — virtualized table rows for large datasets
6.3. Error/empty/loading states audit across all views
6.4. Cross-browser and mobile responsive QA
