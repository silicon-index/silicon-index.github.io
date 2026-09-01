# Silicon Index Developer & Contributor Guide

This document outlines the workflow standards, security policies, and strict data-collection rules applicable to all repositories within the **Silicon Index** organization.

---

## 1. Core Principles & Philosophy

* **Decoupled Architecture:** UI never interacts directly with scraping engines or raw scraping logs. All client-facing data is consumed via sanitized API endpoints.
* **Open & Verifiable Metrics:** Fair value calculations must remain mathematically deterministic and free from vendor bias.
* **Privacy by Design:** Zero personal identifiers (PII), proprietary business metadata, or unstructured arbitrary text are accepted into the core database.

---

## 2. Data Ingestion & Scraping Standards (Strict Whitelist Rule)

All indexer contributions to `market-scrapers` or API schemas must adhere to the following data sanitization pipeline:

### ✅ Permitted Fields:
* `component_id` (Normalized string, e.g., `gpu_rtx_4070_12gb`)
* `price_amount` (Strict numeric value: float/integer, never string)
* `currency` (Standardized ISO code: `USD`, `EUR`, `RON`, etc.)
* `timestamp` (ISO 8601 UTC timestamp)
* `source_type` (Categorical tag: `retail`, `marketplace_avg`, `refurbished`)

### ❌ Strictly Prohibited Data:
* **No PII:** Seller names, individual user accounts, phone numbers, or physical locations.
* **No Raw Descriptions:** Do not ingest unstructured descriptions, forum posts, or arbitrary HTML snippets.
* **No Proprietary Markers:** Strip tracking query parameters (`utm_*`, affiliate tags, internal tracking tokens) from all source references.

---

## 3. Git Workflow & Branching Strategy

To maintain operational stability, direct pushes to `main` are restricted on all repositories.

* **`main` (Production):** Always deployable. Connected directly to GitHub Pages / CI/CD pipelines.
* **`dev` (Development):** Staging branch for active feature development and testing.
* **`feature/<name>`:** Branch created off `dev` for specific tasks, bug fixes, or scrapers.

### Pull Request (PR) Checklist:
1. Ensure code passes local formatting and linting.
2. Confirm no API tokens, environment secrets, or private URLs are committed.
3. Test schema validation with mock seed data before submitting.
4. Open the PR targeting the `dev` branch.

---

## 4. Terms of Service & Legal Compliance for Contributors

By contributing code, models, or data scripts to any repository under `silicon-index`, you agree to the following terms:

1. **Lawful Collection:** Scrapers and tools developed must comply with robots exclusion standards and must not execute aggressive denial-of-service traffic patterns. Rate-limiting backoffs must be implemented by default.
2. **IP Ownership:** Contributions submitted via Pull Requests are licensed under the repository's **GNU AGPLv3** unless explicitly designated otherwise. If you deploy a modified version as a network service, AGPLv3 §13 obliges you to offer its complete source to that service's users.
3. **Audit Rights:** Maintainers reserve the right to immediately reject, sanitize, or delete any data submissions or commits that violate privacy regulations (GDPR) or data safety standards.
