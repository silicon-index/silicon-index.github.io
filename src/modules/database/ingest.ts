/**
 * Market Database — bulk catalogue ingestion.
 *
 * Populating 1990–present is a bulk data problem, not a scraping problem:
 * historical launch specs and MSRPs come from datasets and archives, and no
 * live store lists a 1994 CPU. The `scrapers` module is therefore untouched by
 * this file — it stays dedicated to live pricing from whitelisted stores,
 * while catalogue identity is ingested here.
 *
 * Pure functions with no I/O and no runtime dependencies. The CLI shell in
 * `scripts/seed-catalog.ts` does the filesystem work and calls into this, the
 * same split used for the module APIs and their container bootstraps.
 */

import {
  CATALOG_CONSTRAINTS,
  CATEGORY_ALIASES,
  REQUIRED_SPEC_FIELDS,
  SPEC_FIELDS,
  STORAGE_TYPES,
  type CatalogComponent,
  type ComponentCategory,
  type IngestionReport,
  type RejectedRow,
  type SpecValue,
  type ValidationIssue
} from "./contracts";

/** Upper bound for a plausible release year: next year, to allow announced parts. */
function maxReleaseYear(now: Date = new Date()): number {
  return now.getUTCFullYear() + 1;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Minimal RFC 4180 CSV reader: handles quoted fields, escaped quotes (`""`),
 * embedded commas and newlines, and CRLF. Written out rather than pulled in so
 * ingestion keeps zero dependencies and runs anywhere.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return [];

  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((cells) =>
    Object.fromEntries(header.map((key, index) => [key, (cells[index] ?? "").trim()]))
  );
}

/** Normalizes a category label from a source dataset, or null when unrecognized. */
export function normalizeCategory(raw: unknown): ComponentCategory | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? null;
}

/** Normalized `component_id` per DEV-GUIDE.md §2 (e.g. `gpu_rtx_4070_12gb`). */
export function normalizeSku(name: string, category: string): string {
  const slug = `${category} ${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "unknown_component";
}

/**
 * Coerces a raw cell into a primitive spec value.
 * CSV gives everything as strings, so numeric and boolean columns are
 * recovered here; anything else is kept as trimmed text.
 *
 * Returns `null` when the value is absent, and `undefined` when the value is
 * not representable as a primitive (a nested object or array). The caller must
 * keep those so validation can reject the row: silently dropping a nested blob
 * would let prohibited data pass as a clean record.
 */
export function coerceSpecValue(raw: unknown): SpecValue | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return undefined;

  const text = raw.trim();
  if (text === "") return null;
  if (text.toLowerCase() === "true") return true;
  if (text.toLowerCase() === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

/**
 * Extracts category specs from a row.
 * Any column prefixed `spec_` becomes a spec key, so a dataset can add
 * `spec_cudaCores` or `spec_infinityFabricClock` with no code change. An
 * explicit `specs` object is merged in when present (JSON sources).
 */
export function extractSpecs(row: Record<string, unknown>): Record<string, unknown> {
  const specs: Record<string, unknown> = {};

  // Deliberately `unknown`, not `ComponentSpecs`: a non-primitive value is kept
  // verbatim so `validateCatalogComponent` rejects the row by name, rather than
  // being stripped here and passing as clean.
  const assign = (key: string, value: unknown): void => {
    const coerced = coerceSpecValue(value);
    if (coerced === undefined) specs[key] = value;
    else if (coerced !== null) specs[key] = coerced;
  };

  const existing = row.specs;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [key, value] of Object.entries(existing as Record<string, unknown>)) assign(key, value);
  }

  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith("spec_")) continue;
    assign(key.slice("spec_".length), value);
  }

  return specs;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function numberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,"'\s]/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * Validates a spec bag against its category's contract.
 *
 * Unknown keys are REJECTED rather than dropped: an unexpected spec column in
 * a bulk file almost always means a mapping error, and silently discarding it
 * is how bad source data goes unnoticed. Adding a genuinely new attribute is a
 * deliberate one-line change to `SPEC_FIELDS` and the matching interface.
 */
export function validateSpecs(specs: Record<string, unknown>, rawCategory: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const category = typeof rawCategory === "string" ? (rawCategory as ComponentCategory) : null;
  const allowed = category && SPEC_FIELDS[category] ? SPEC_FIELDS[category] : null;

  for (const [key, value] of Object.entries(specs)) {
    const type = typeof value;
    if (value !== null && type !== "string" && type !== "number" && type !== "boolean") {
      issues.push({ field: `specs.${key}`, message: "Spec values must be string, number, boolean, or null." });
      continue;
    }
    if (allowed && !allowed.includes(key)) {
      issues.push({
        field: `specs.${key}`,
        message: `Not a ${category} spec. Allowed: ${allowed.join(", ")}.`
      });
    }
  }

  if (allowed && category) {
    for (const required of REQUIRED_SPEC_FIELDS[category]) {
      const value = specs[required];
      if (value === undefined || value === null || value === "") {
        issues.push({ field: `specs.${required}`, message: `Required for ${category}.` });
      }
    }
  }

  // The only closed-value spec field.
  if (category === "STORAGE" && specs.type !== undefined && !STORAGE_TYPES.includes(specs.type as never)) {
    issues.push({ field: "specs.type", message: `Must be one of: ${STORAGE_TYPES.join(", ")}.` });
  }

  return issues;
}

/**
 * Validates one already-shaped candidate against `CATALOG_CONSTRAINTS`.
 * Collects every issue rather than failing on the first, so an operator can
 * fix a source row in one pass.
 */
export function validateCatalogComponent(candidate: unknown, now: Date = new Date()): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return [{ field: "<root>", message: "Expected a catalogue record object." }];
  }

  const record = candidate as Record<string, unknown>;

  for (const constraint of CATALOG_CONSTRAINTS) {
    const value = record[constraint.field];

    if (value === null && constraint.nullable) continue;
    if (value === undefined || value === null) {
      if (constraint.required) issues.push({ field: constraint.field, message: "Field is required." });
      continue;
    }

    if (constraint.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push({ field: constraint.field, message: "Must be a finite number." });
      } else if (constraint.min !== undefined && value < constraint.min) {
        issues.push({ field: constraint.field, message: `Must be >= ${constraint.min}.` });
      }
      continue;
    }

    if (constraint.type === "string") {
      if (typeof value !== "string" || value.trim() === "") {
        issues.push({ field: constraint.field, message: "Must be a non-empty string." });
      } else if (constraint.oneOf && !constraint.oneOf.includes(value)) {
        issues.push({ field: constraint.field, message: `Must be one of: ${constraint.oneOf.join(", ")}.` });
      }
      continue;
    }

    if (constraint.type === "object") {
      if (typeof value !== "object" || Array.isArray(value)) {
        issues.push({ field: constraint.field, message: "Must be an object." });
      } else {
        issues.push(...validateSpecs(value as Record<string, unknown>, record.category));
      }
    }
  }

  const year = record.releaseYear;
  if (typeof year === "number" && Number.isFinite(year) && year > maxReleaseYear(now)) {
    issues.push({ field: "releaseYear", message: `Must be <= ${maxReleaseYear(now)}.` });
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/* Ingestion                                                           */
/* ------------------------------------------------------------------ */

/** Maps one source row onto the base template, coercing loose source types. */
export function toCatalogComponent(row: Record<string, unknown>): Record<string, unknown> {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const category = normalizeCategory(row.category);
  const manufacturer = typeof row.manufacturer === "string" ? row.manufacturer.trim() : "";
  const providedSku = typeof row.sku === "string" ? row.sku.trim() : "";

  return {
    sku: providedSku || (name && category ? normalizeSku(name, category) : ""),
    name,
    // Left as the raw value when unrecognized, so validation reports the real
    // problem ("must be one of ...") instead of a missing-field error.
    category: category ?? row.category,
    manufacturer,
    releaseYear: numberOrNull(row.releaseYear) ?? row.releaseYear,
    originalMSRP: numberOrNull(row.originalMSRP ?? row.msrp),
    currency: typeof row.currency === "string" && row.currency.trim() ? row.currency.trim().toUpperCase() : "USD",
    specs: extractSpecs(row)
  };
}

/**
 * Ingests bulk rows into a clean catalogue.
 *
 * Invalid rows are dropped with their issues recorded, and duplicate SKUs keep
 * only the first occurrence — a bulk file with one bad row should still yield
 * a usable catalogue, but silently is the wrong way to do it.
 */
export function ingestCatalogRows(
  rows: Record<string, unknown>[],
  source: string,
  now: Date = new Date()
): IngestionReport {
  const accepted: CatalogComponent[] = [];
  const rejected: RejectedRow[] = [];
  const duplicateSkus: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const candidate = toCatalogComponent(row);
    const issues = validateCatalogComponent(candidate, now);
    const sku = typeof candidate.sku === "string" && candidate.sku ? candidate.sku : null;

    if (issues.length > 0) {
      rejected.push({ row: index + 1, sku, issues });
      return;
    }

    if (sku && seen.has(sku)) {
      duplicateSkus.push(sku);
      rejected.push({ row: index + 1, sku, issues: [{ field: "sku", message: "Duplicate SKU; first occurrence kept." }] });
      return;
    }

    if (sku) seen.add(sku);
    accepted.push(candidate as unknown as CatalogComponent);
  });

  // Stable, human-scannable output: category then release year then name.
  accepted.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.releaseYear - b.releaseYear ||
      a.name.localeCompare(b.name)
  );

  return { source, totalRows: rows.length, accepted, rejected, duplicateSkus };
}

/** Parses a bulk payload by extension, then ingests it. */
export function ingestBulkPayload(text: string, source: string, now: Date = new Date()): IngestionReport {
  const isCsv = source.toLowerCase().endsWith(".csv");
  let rows: Record<string, unknown>[];

  if (isCsv) {
    rows = parseCsv(text);
  } else {
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { components?: unknown[] }).components)
        ? ((parsed as { components: unknown[] }).components)
        : null;
    if (!list) throw new Error("Expected a JSON array, or an object with a `components` array.");
    rows = list as Record<string, unknown>[];
  }

  return ingestCatalogRows(rows, source, now);
}
