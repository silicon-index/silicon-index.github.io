// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Market Scrapers — ingestion payload and sanitization contracts.
 *
 * Pure types, no runtime imports. **Layer-0 contract.**
 *
 * These encode DEV-GUIDE.md §2 (Strict Whitelist Rule) as types: an ingestion
 * payload may carry only normalized identifiers, strictly numeric prices, ISO
 * currency/timestamp, and a categorical source tag. Seller names, free text,
 * locations, and any other PII are not representable in this shape — the
 * whitelist is enforced by the type, not merely documented.
 *
 * Mirrors `silicon-index-market-scrapers.github.io`.
 */

/** Categorical provenance tag. Deliberately closed — no free-text sources. */
export type SourceType = "retail" | "marketplace_avg" | "refurbished";

/**
 * A single sanitized observation emitted by a scraper worker.
 *
 * Note what is absent and must stay absent: seller identity, buyer identity,
 * URLs with tracking parameters, physical locations, and any unstructured
 * description or raw HTML.
 */
export interface IngestionPayload {
  /** Normalized `component_id`, e.g. `gpu_rtx_4070_12gb`. */
  component_id: string;
  /** Strict numeric value — never a formatted string. */
  price_amount: number;
  /** ISO 4217 code. */
  currency: string;
  /** ISO 8601 UTC timestamp. */
  timestamp: string;
  source_type: SourceType;
  /** Identifier of the whitelisted store this came from. */
  store_id: string;
}

/** Fields permitted in an ingestion payload. Anything else is rejected. */
export const PERMITTED_INGESTION_FIELDS = [
  "component_id",
  "price_amount",
  "currency",
  "timestamp",
  "source_type",
  "store_id"
] as const;

export type PermittedIngestionField = (typeof PERMITTED_INGESTION_FIELDS)[number];

/** Query parameters stripped from any source reference before storage. */
export const STRIPPED_QUERY_PREFIXES = ["utm_", "fbclid", "gclid", "ref", "tag", "affiliate"] as const;

/* ------------------------------------------------------------------ */
/* Store whitelist                                                     */
/* ------------------------------------------------------------------ */

/**
 * A store a scraper is permitted to collect from.
 * `rateLimitMs` and `respectsRobotsTxt` are contractual, not advisory:
 * DEV-GUIDE.md §4 requires rate-limiting backoffs and robots compliance.
 */
export interface WhitelistedStore {
  storeId: string;
  displayName: string;
  /** Bare hostname, no scheme or path. */
  hostname: string;
  sourceType: SourceType;
  /** Minimum delay between requests, in milliseconds. */
  rateLimitMs: number;
  respectsRobotsTxt: true;
  enabled: boolean;
}

export type StoreWhitelist = WhitelistedStore[];

/* ------------------------------------------------------------------ */
/* Sanitization                                                        */
/* ------------------------------------------------------------------ */

export type SanitizationRejectionCode =
  | "not_whitelisted"
  | "disallowed_field"
  | "non_numeric_price"
  | "negative_price"
  | "invalid_timestamp"
  | "invalid_currency"
  | "unknown_source_type";

export interface SanitizationRejection {
  code: SanitizationRejectionCode;
  field?: string;
  detail: string;
}

/**
 * Result of running a raw scraped record through the sanitization pipeline.
 * A rejected record yields no payload — partial ingestion is not permitted.
 */
export type SanitizationResult =
  | { accepted: true; payload: IngestionPayload; strippedFields: string[] }
  | { accepted: false; rejections: SanitizationRejection[] };

/** Contract a scraper worker implements. */
export interface ScraperWorker {
  storeId: string;
  /** Collect and sanitize; implementations must honour the store's rate limit. */
  collect(componentIds: string[]): Promise<SanitizationResult[]>;
}
