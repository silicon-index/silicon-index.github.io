/**
 * Market Scrapers — sanitization pipeline.
 *
 * Implements the contract in `./contracts.ts`, enforcing DEV-GUIDE.md §2 at
 * runtime: a raw scraped record is accepted only if it carries exclusively
 * whitelisted fields with valid values, and is rejected outright otherwise.
 * Partial ingestion is deliberately not possible — a rejected record yields
 * no payload at all.
 *
 * Pure functions, no runtime dependencies, so this runs identically in a
 * container and on the edge.
 */

import {
  PERMITTED_INGESTION_FIELDS,
  STRIPPED_QUERY_PREFIXES,
  type IngestionPayload,
  type SanitizationRejection,
  type SanitizationResult,
  type SourceType,
  type StoreWhitelist
} from "./contracts";

const SOURCE_TYPES: readonly SourceType[] = ["retail", "marketplace_avg", "refurbished"];
const ISO_CURRENCY = /^[A-Z]{3}$/;

/**
 * Strips tracking parameters from a source URL.
 * Returns the bare origin+path when the URL cannot be parsed, so a malformed
 * reference can never smuggle a tracking query through.
 */
export function stripTrackingParams(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (STRIPPED_QUERY_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(prefix))) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * Runs a raw record through the whitelist pipeline.
 *
 * @param raw       Untrusted record from a scraper worker.
 * @param whitelist Stores permitted to contribute observations.
 */
export function sanitizeRecord(raw: unknown, whitelist: StoreWhitelist): SanitizationResult {
  const rejections: SanitizationRejection[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { accepted: false, rejections: [{ code: "disallowed_field", detail: "Expected an object record." }] };
  }

  const record = raw as Record<string, unknown>;

  // Any field outside the whitelist is a rejection, not something to drop
  // quietly — an unexpected field means the worker is emitting data we did
  // not agree to ingest, and that is worth surfacing.
  const permitted = new Set<string>(PERMITTED_INGESTION_FIELDS);
  const strippedFields: string[] = [];
  for (const key of Object.keys(record)) {
    if (!permitted.has(key)) {
      rejections.push({ code: "disallowed_field", field: key, detail: `Field "${key}" is not on the ingestion whitelist.` });
    }
  }

  const storeId = String(record.store_id ?? "");
  const store = whitelist.find((s) => s.storeId === storeId && s.enabled);
  if (!store) {
    rejections.push({ code: "not_whitelisted", field: "store_id", detail: `Store "${storeId}" is not whitelisted or is disabled.` });
  }

  const price = record.price_amount;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    rejections.push({ code: "non_numeric_price", field: "price_amount", detail: "Price must be a finite number, never a formatted string." });
  } else if (price < 0) {
    rejections.push({ code: "negative_price", field: "price_amount", detail: "Price must not be negative." });
  }

  const currency = String(record.currency ?? "");
  if (!ISO_CURRENCY.test(currency)) {
    rejections.push({ code: "invalid_currency", field: "currency", detail: "Expected a 3-letter ISO 4217 code." });
  }

  const timestamp = String(record.timestamp ?? "");
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    rejections.push({ code: "invalid_timestamp", field: "timestamp", detail: "Expected an ISO 8601 UTC timestamp." });
  }

  const sourceType = record.source_type as SourceType;
  if (!SOURCE_TYPES.includes(sourceType)) {
    rejections.push({ code: "unknown_source_type", field: "source_type", detail: `Expected one of: ${SOURCE_TYPES.join(", ")}.` });
  }

  const componentId = String(record.component_id ?? "");
  if (!componentId) {
    rejections.push({ code: "disallowed_field", field: "component_id", detail: "A normalized component_id is required." });
  }

  if (rejections.length > 0) return { accepted: false, rejections };

  const payload: IngestionPayload = {
    component_id: componentId,
    price_amount: price as number,
    currency,
    timestamp: new Date(timestamp).toISOString(),
    source_type: sourceType,
    store_id: storeId
  };

  return { accepted: true, payload, strippedFields };
}

/** Convenience: sanitize a batch, preserving input order. */
export function sanitizeBatch(records: unknown[], whitelist: StoreWhitelist): SanitizationResult[] {
  return records.map((record) => sanitizeRecord(record, whitelist));
}
