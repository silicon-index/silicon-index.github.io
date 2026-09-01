# Silicon Index — Market Scrapers (stub)

- **Target repo:** `https://github.com/silicon-index/silicon-index-market-scrapers.github.io`
- **Branch:** `dev`
- **Nav id:** `scrapers` (see `src/config/navigation.ts`)

Automated aggregation workers with whitelist sanitization

This directory is a documentation + contract stub inside the frontend repo. The
module itself lives in its own repository; nothing here is a copy of it.

## Contents

- `contracts.ts` — `IngestionPayload` and `PERMITTED_INGESTION_FIELDS` (DEV-GUIDE.md §2
  whitelist encoded as types — seller names, free text, and locations are not *representable*),
  `SourceType`, `STRIPPED_QUERY_PREFIXES`, the store whitelist (`WhitelistedStore` with a
  mandatory `rateLimitMs` and `respectsRobotsTxt: true`), and the sanitization pipeline
  (`SanitizationResult`, `SanitizationRejectionCode`, `ScraperWorker`).

No runtime implementation yet — this module publishes nothing the portal consumes so far.
