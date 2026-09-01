/**
 * Market Database — hardware contracts and validation models.
 *
 * Pure types, no runtime imports. **Layer-0 contract**: the canonical hardware
 * record lives here, and `src/lib/types.ts` re-exports it for app-wide use.
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

/**
 * The portal's canonical hardware record.
 * `sku` is the normalized `component_id` required by DEV-GUIDE.md §2.
 */
export interface HardwareComponent {
  sku: string;
  name: string;
  category: string;
  /** Manufacturer suggested retail price at launch. */
  msrp: number;
  /** Current median observed market price across tracked sources. */
  medianMarketPrice: number;
  currency: string;
  /** Chronological price series, oldest first. */
  historicalPrices: PricePointTuple[];
  /** Deterministic fair-value index (see the screener sidebar note). */
  fairValueScore: number;
  socket: string;
  generation: string;
  releaseYear: number;
  tdpWatts: number;
}

/**
 * Raw record shape as stored in `public/mock-data.json` and accepted from the
 * market-database repo. Normalized into `HardwareComponent` by `./adapters.ts`.
 */
export interface ComponentEntry {
  id: string;
  name: string;
  category: string;
  socket: string;
  generation: string;
  releaseYear: number;
  tdpWatts: number;
  /** Launch MSRP. */
  msrp: number;
  fairValueScore: number;
  marketPrice: number;
  currency: string;
  priceHistory: PricePoint[];
}

/* ------------------------------------------------------------------ */
/* Validation models                                                   */
/* ------------------------------------------------------------------ */

/** Field-level validation constraints applied before a record is accepted. */
export interface FieldConstraint {
  field: keyof HardwareComponent;
  required: boolean;
  type: "string" | "number" | "array";
  /** Inclusive lower bound for numeric fields. */
  min?: number;
}

export const HARDWARE_CONSTRAINTS: FieldConstraint[] = [
  { field: "sku", required: true, type: "string" },
  { field: "name", required: true, type: "string" },
  { field: "category", required: true, type: "string" },
  { field: "msrp", required: true, type: "number", min: 0 },
  { field: "medianMarketPrice", required: true, type: "number", min: 0 },
  { field: "currency", required: true, type: "string" },
  { field: "historicalPrices", required: true, type: "array" }
];

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
