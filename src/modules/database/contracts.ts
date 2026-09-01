/**
 * Market Database — hardware contracts and validation models.
 *
 * Pure types, no runtime imports. **Layer-0 contract.**
 *
 * The catalogue spans 1990–present, so the model is split deliberately:
 *
 *   `CatalogComponent`  the universal BASE TEMPLATE — immutable facts about a
 *                       part (identity, maker, launch price, category specs).
 *                       Populated by bulk ingestion, not by scraping.
 *   `HardwareComponent` base template + MARKET STATE (observed prices, fair
 *                       value). Market state is what scrapers maintain.
 *
 * Keeping them apart matters: a 1994 CPU has a permanent identity but may have
 * no live market data at all, and conflating the two would make the absence of
 * a price look like a defective catalogue record.
 *
 * Mirrors `silicon-index-market-database.github.io`.
 */

/** A single historical observation: `[unix-ms timestamp, price]`. */
export type PricePointTuple = [number, number];

/** Month-keyed observation as stored in the portal's local dataset. */
export interface PricePoint {
  month: string;
  price: number;
}

/** Closed category set. Extend deliberately — every consumer switches on it. */
export type ComponentCategory = "CPU" | "GPU" | "RAM" | "MOBO" | "STORAGE";

export const COMPONENT_CATEGORIES: readonly ComponentCategory[] = ["CPU", "GPU", "RAM", "MOBO", "STORAGE"];

/**
 * Aliases accepted by ingestion and normalized to the canonical category.
 * Historical datasets spell these many ways; the catalogue stores one form.
 */
export const CATEGORY_ALIASES: Record<string, ComponentCategory> = {
  cpu: "CPU",
  processor: "CPU",
  gpu: "GPU",
  "graphics card": "GPU",
  "video card": "GPU",
  ram: "RAM",
  memory: "RAM",
  mobo: "MOBO",
  motherboard: "MOBO",
  mainboard: "MOBO",
  storage: "STORAGE",
  ssd: "STORAGE",
  hdd: "STORAGE"
};

/* ------------------------------------------------------------------ */
/* Category-specific specs                                             */
/* ------------------------------------------------------------------ */

/**
 * Spec values are restricted to primitives on purpose. Ingestion accepts
 * arbitrary *keys* so new attributes need no code change, but not arbitrary
 * *shapes* — nested objects are where unvalidated blobs and free text
 * (DEV-GUIDE.md §2) would otherwise creep into the catalogue.
 */
export type SpecValue = string | number | boolean | null;

/** Open bag: any key, primitive values only. */
export type ComponentSpecs = Record<string, SpecValue>;

/**
 * Documented shapes for the categories tracked today. These describe what a
 * well-formed record carries; they do not restrict what may be added, since
 * `ComponentSpecs` stays open for attributes like `cudaCores` or
 * `infinityFabricClock` that arrive later.
 *
 * They intentionally do NOT extend `ComponentSpecs`: an optional property is
 * `T | undefined`, which no index signature over primitives can accept. Use
 * `specsAs<CpuSpecs>(component)` to read a record through one of these.
 */
export interface CpuSpecs {
  socket: string;
  generation?: string;
  cores?: number;
  threads?: number;
  tdpWatts?: number;
  baseClockMhz?: number;
}

export interface GpuSpecs {
  generation?: string;
  vramGb?: number;
  vramType?: string;
  cudaCores?: number;
  streamProcessors?: number;
  tdpWatts?: number;
}

export interface RamSpecs {
  memoryType?: string;
  capacityGb?: number;
  speedMts?: number;
  modules?: number;
  casLatency?: number;
}

export interface MoboSpecs {
  socket: string;
  chipset?: string;
  formFactor?: string;
  memoryType?: string;
}

export interface StorageSpecs {
  interface?: string;
  capacityGb?: number;
  formFactor?: string;
  nandType?: string;
  readMbps?: number;
}

/**
 * Reads a component's open spec bag through a documented shape.
 * A view, not a guarantee — ingestion accepts unknown keys by design, so
 * callers must still handle a missing field.
 */
export function specsAs<T>(component: { specs: ComponentSpecs }): Partial<T> {
  return component.specs as Partial<T>;
}

/** Maps a category to its documented spec shape. */
export interface SpecsByCategory {
  CPU: CpuSpecs;
  GPU: GpuSpecs;
  RAM: RamSpecs;
  MOBO: MoboSpecs;
  STORAGE: StorageSpecs;
}

/* ------------------------------------------------------------------ */
/* Base template                                                       */
/* ------------------------------------------------------------------ */

/**
 * Universal base template — every catalogued part, 1990 to today, has these.
 * `sku` is the normalized `component_id` required by DEV-GUIDE.md §2.
 */
export interface CatalogComponent {
  sku: string;
  /** Display name, e.g. "Ryzen 7 7800X3D". */
  name: string;
  category: ComponentCategory;
  /** Vendor/brand, e.g. "AMD", "NVIDIA", "ASUS". */
  manufacturer: string;
  releaseYear: number;
  /** Launch MSRP in `currency`. Null when no launch price is documented. */
  originalMSRP: number | null;
  currency: string;
  /** Category-specific details. Empty object when nothing is recorded yet. */
  specs: ComponentSpecs;
}

/**
 * A catalogued part together with its current market state.
 * This is what the screener and the APIs serve.
 */
export interface HardwareComponent extends CatalogComponent {
  /** Current median observed market price across tracked sources. */
  medianMarketPrice: number;
  /** Chronological price series, oldest first. */
  historicalPrices: PricePointTuple[];
  /** Deterministic fair-value index (see the screener sidebar note). */
  fairValueScore: number;
}

/**
 * Raw record shape as stored in `public/mock-data.json` and accepted from the
 * market-database repo. Normalized into `HardwareComponent` by `./adapters.ts`.
 */
export interface ComponentEntry {
  id: string;
  name: string;
  category: ComponentCategory;
  manufacturer: string;
  releaseYear: number;
  originalMSRP: number | null;
  fairValueScore: number;
  marketPrice: number;
  currency: string;
  specs: ComponentSpecs;
  priceHistory: PricePoint[];
}

/* ------------------------------------------------------------------ */
/* Validation models                                                   */
/* ------------------------------------------------------------------ */

/** Earliest catalogued release year. The index covers 1990 onward. */
export const CATALOG_MIN_YEAR = 1990;

/** Field-level validation constraints applied before a record is accepted. */
export interface FieldConstraint {
  field: keyof HardwareComponent;
  required: boolean;
  type: "string" | "number" | "array" | "object";
  /** Inclusive lower bound for numeric fields. */
  min?: number;
  /** Permitted values for enumerated string fields. */
  oneOf?: readonly string[];
  /** When true, an explicit `null` is accepted in place of a value. */
  nullable?: boolean;
}

/** Constraints for the base template — applied to catalogue and market records alike. */
export const CATALOG_CONSTRAINTS: FieldConstraint[] = [
  { field: "sku", required: true, type: "string" },
  { field: "name", required: true, type: "string" },
  { field: "category", required: true, type: "string", oneOf: COMPONENT_CATEGORIES },
  { field: "manufacturer", required: true, type: "string" },
  { field: "releaseYear", required: true, type: "number", min: CATALOG_MIN_YEAR },
  { field: "originalMSRP", required: true, type: "number", min: 0, nullable: true },
  { field: "currency", required: true, type: "string" },
  { field: "specs", required: true, type: "object" }
];

/** Additional constraints for a record carrying market state. */
export const MARKET_CONSTRAINTS: FieldConstraint[] = [
  { field: "medianMarketPrice", required: true, type: "number", min: 0 },
  { field: "fairValueScore", required: true, type: "number", min: 0 },
  { field: "historicalPrices", required: true, type: "array" }
];

/** Full constraint set for a `HardwareComponent`. */
export const HARDWARE_CONSTRAINTS: FieldConstraint[] = [...CATALOG_CONSTRAINTS, ...MARKET_CONSTRAINTS];

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/* ------------------------------------------------------------------ */
/* Bulk ingestion                                                      */
/* ------------------------------------------------------------------ */

/**
 * One row rejected during bulk ingestion, kept so an operator can fix the
 * source data rather than guessing why a row vanished.
 */
export interface RejectedRow {
  /** 1-based index in the source file, matching what an editor shows. */
  row: number;
  sku: string | null;
  issues: ValidationIssue[];
}

/** Outcome of ingesting a bulk catalogue file. */
export interface IngestionReport {
  source: string;
  totalRows: number;
  accepted: CatalogComponent[];
  rejected: RejectedRow[];
  /** SKUs that appeared more than once; only the first occurrence is kept. */
  duplicateSkus: string[];
}
