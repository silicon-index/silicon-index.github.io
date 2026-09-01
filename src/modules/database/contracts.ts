// SPDX-License-Identifier: AGPL-3.0-or-later
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
 * `specs` is a DISCRIMINATED UNION keyed on `category`, so reading
 * `component.specs.socket` requires narrowing to a category that actually has
 * a socket. The compiler enforces it; there is no untyped bag left.
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

/**
 * `as const` rather than a widened array: the literal tuple is what lets the
 * Drizzle schema declare `category` as a real SQL enum instead of loose text.
 */
export const COMPONENT_CATEGORIES = ["CPU", "GPU", "RAM", "MOBO", "STORAGE"] as const satisfies readonly ComponentCategory[];

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
 * Every spec value is a primitive. Nested objects are where unvalidated blobs
 * and free text (DEV-GUIDE.md §2) would otherwise re-enter the catalogue.
 */
export type SpecValue = string | number | boolean | null;

/**
 * Optionality is not laziness — it is the 1990–2026 range.
 *
 * A 1993 Pentium has an architecture, socket, core count and TDP but no boost
 * clock; a 2009 GPU has no compute units as the term is used today. Only
 * fields that every part in a category genuinely has are required. Ingesting
 * historical data would fail outright if the modern field set were mandatory.
 *
 * Units are fixed and encoded here rather than in the values, so nothing has
 * to parse "3.2 GHz" at read time.
 */
export interface CpuSpecs {
  /** Microarchitecture, e.g. "Zen 4", "Raptor Lake", "P5". */
  architecture: string;
  /** Physical socket, e.g. "AM5", "LGA1700", "Socket 4". */
  socket: string;
  cores: number;
  /** Absent for pre-SMT parts where the concept does not apply. */
  threads?: number;
  /** Base clock in MHz. */
  baseClock?: number;
  /** Boost clock in MHz. Absent on parts that predate boosting. */
  boostClock?: number;
  /** Thermal design power in watts. */
  tdp?: number;
  /** Cache as published, e.g. "96MB L3", "512KB L2". */
  cache?: string;
}

/**
 * A GPU has no socket — it is a card on a bus, not a part seated in one. The
 * union enforces that: `socket` exists on `CpuSpecs` and `MoboSpecs` only.
 */
export interface GpuSpecs {
  /** Microarchitecture, e.g. "RDNA 4", "Ada Lovelace", "TNT2". */
  architecture: string;
  /** Silicon codename, e.g. "Navi 48", "AD104". */
  codename?: string;
  /** Host interface, e.g. "PCIe 5.0 x16", "AGP 4x". */
  bus?: string;
  /** VRAM in GB. Fractional for pre-2000 parts (e.g. 0.032 for 32MB). */
  vramCapacity: number;
  /** e.g. "GDDR7", "GDDR6", "SDR". */
  vramType?: string;
  /** Memory bus width in bits, e.g. 256. */
  memoryBusWidth?: number;
  /** Memory clock in MHz. */
  memoryClock?: number;
  /** Core clock in MHz. */
  coreClock?: number;
  /** Boost clock in MHz. */
  boostClock?: number;
  /**
   * Vendor's own top-level block count — Compute Units on AMD, SMs on NVIDIA.
   * Distinct from `shadingUnits`: an RX 9070 XT has 64 CUs and 4096 shaders.
   */
  computeUnits?: number;
  /** Shading units / stream processors — the "Cores" figure in spec tables. */
  shadingUnits?: number;
  /** Texture mapping units. */
  tmus?: number;
  /** Render output units. */
  rops?: number;
  /** Board power in watts. */
  tdp?: number;
}

export interface MoboSpecs {
  /** e.g. "X870E", "Z790", "440BX". */
  chipset: string;
  socket: string;
  /** e.g. "ATX", "Micro-ATX", "Mini-ITX". */
  formFactor: string;
  /** e.g. "DDR5", "DDR4", "SDRAM". */
  memoryType: string;
}

export interface RamSpecs {
  /** Total kit capacity in GB. */
  capacity: number;
  /** e.g. "DDR5", "DDR4". */
  memoryType: string;
  /** Data rate in MT/s, e.g. 6000. */
  speed: number;
  /** Timing as published, e.g. "CL30". */
  latency?: string;
  /** Kit layout as published, e.g. "2x16GB". */
  modules?: string;
}

export interface StorageSpecs {
  /** Drive class. */
  type: "NVMe" | "SATA" | "HDD";
  /** Capacity in GB. */
  capacity: number;
  /** e.g. "M.2 2280", "2.5in", "3.5in". */
  formFactor?: string;
  /** Bus, e.g. "PCIe 5.0 x4", "SATA III". */
  interface?: string;
  /** Sequential read in MB/s. */
  readSpeed?: number;
  /** Sequential write in MB/s. */
  writeSpeed?: number;
}

/** The spec shape for any single category. */
export type ComponentSpecs = CpuSpecs | GpuSpecs | RamSpecs | MoboSpecs | StorageSpecs;

/** Maps a category to its spec shape. */
export interface SpecsByCategory {
  CPU: CpuSpecs;
  GPU: GpuSpecs;
  RAM: RamSpecs;
  MOBO: MoboSpecs;
  STORAGE: StorageSpecs;
}

/**
 * Permitted spec keys per category, mirroring the interfaces above.
 *
 * A runtime copy is unavoidable — TypeScript types are erased, and bulk
 * ingestion has to validate keys that arrive from a CSV at runtime. Keep this
 * in step with the interfaces; `checkSpecFieldParity` in the test suite fails
 * if they drift.
 */
export const SPEC_FIELDS: Record<ComponentCategory, readonly string[]> = {
  CPU: ["architecture", "socket", "cores", "threads", "baseClock", "boostClock", "tdp", "cache"],
  GPU: ["architecture", "codename", "bus", "vramCapacity", "vramType", "memoryBusWidth", "memoryClock",
        "coreClock", "boostClock", "computeUnits", "shadingUnits", "tmus", "rops", "tdp"],
  MOBO: ["chipset", "socket", "formFactor", "memoryType"],
  RAM: ["capacity", "memoryType", "speed", "latency", "modules"],
  STORAGE: ["type", "capacity", "formFactor", "interface", "readSpeed", "writeSpeed"]
};

/** Spec keys that must be present for a record of that category to be valid. */
export const REQUIRED_SPEC_FIELDS: Record<ComponentCategory, readonly string[]> = {
  CPU: ["architecture", "socket", "cores"],
  GPU: ["architecture", "vramCapacity"],
  MOBO: ["chipset", "socket", "formFactor", "memoryType"],
  RAM: ["capacity", "memoryType", "speed"],
  STORAGE: ["type", "capacity"]
};

/** Accepted values for `StorageSpecs.type`. */
export const STORAGE_TYPES = ["NVMe", "SATA", "HDD"] as const satisfies readonly StorageSpecs["type"][];

/* ------------------------------------------------------------------ */
/* Base template                                                       */
/* ------------------------------------------------------------------ */

/** Fields every catalogued part carries, 1990 to today. */
export interface CatalogBase {
  /** Normalized `component_id` per DEV-GUIDE.md §2. */
  sku: string;
  /** Display name, e.g. "Ryzen 7 7800X3D". */
  name: string;
  /** Vendor/brand, e.g. "AMD", "NVIDIA", "ASUS". */
  manufacturer: string;
  releaseYear: number;
  /** Launch MSRP in `currency`. Null when no launch price is documented. */
  originalMSRP: number | null;
  currency: string;
}

type CatalogOf<C extends ComponentCategory> = CatalogBase & { category: C; specs: SpecsByCategory[C] };

/**
 * Universal base template, discriminated on `category`.
 * Narrow before reading `specs`:
 *
 * ```ts
 * if (component.category === "CPU") component.specs.socket; // ok
 * ```
 */
export type CatalogComponent =
  | CatalogOf<"CPU">
  | CatalogOf<"GPU">
  | CatalogOf<"RAM">
  | CatalogOf<"MOBO">
  | CatalogOf<"STORAGE">;

/** Market state maintained by scrapers, layered onto the base template. */
export interface MarketState {
  /** Current median observed market price across tracked sources. */
  medianMarketPrice: number;
  /** Chronological price series, oldest first. */
  historicalPrices: PricePointTuple[];
  /** Deterministic fair-value index (see the screener sidebar note). */
  fairValueScore: number;
}

/**
 * A catalogued part together with its current market state.
 * This is what the screener and the APIs serve.
 */
export type HardwareComponent = CatalogComponent & MarketState;

/** Narrowed alias, e.g. `ComponentOf<"CPU">`. */
export type ComponentOf<C extends ComponentCategory> = CatalogOf<C> & MarketState;

type EntryOf<C extends ComponentCategory> = {
  id: string;
  name: string;
  category: C;
  manufacturer: string;
  releaseYear: number;
  originalMSRP: number | null;
  fairValueScore: number;
  marketPrice: number;
  currency: string;
  specs: SpecsByCategory[C];
  priceHistory: PricePoint[];
};

/**
 * Raw record shape as stored in `public/mock-data.json` and accepted from the
 * market-database repo. Normalized into `HardwareComponent` by `./adapters.ts`.
 */
export type ComponentEntry =
  | EntryOf<"CPU">
  | EntryOf<"GPU">
  | EntryOf<"RAM">
  | EntryOf<"MOBO">
  | EntryOf<"STORAGE">;

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
