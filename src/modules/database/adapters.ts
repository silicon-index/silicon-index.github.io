/**
 * Market Database module — normalization between stored records and the
 * canonical model.
 *
 * Mirrors the responsibility of `silicon-index-market-database.github.io`:
 * schemas, validation, and normalized identifiers. The upstream wire shape
 * lives in `./schemas.ts`; this file handles the portal's own dataset.
 */

import type { ComponentEntry, HardwareComponent, PricePointTuple } from "./contracts";

function monthToTimestamp(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return Date.UTC(year, (m || 1) - 1, 1);
}

/** Normalizes the local `mock-data.json` shape into `HardwareComponent`. */
export function toHardwareComponent(entry: ComponentEntry): HardwareComponent {
  return {
    sku: entry.id,
    name: entry.name,
    category: entry.category,
    msrp: entry.msrp,
    medianMarketPrice: entry.marketPrice,
    currency: entry.currency,
    historicalPrices: entry.priceHistory.map((p) => [monthToTimestamp(p.month), p.price] as PricePointTuple),
    fairValueScore: entry.fairValueScore,
    socket: entry.socket,
    generation: entry.generation,
    releaseYear: entry.releaseYear,
    tdpWatts: entry.tdpWatts
  };
}

export function isHardwareComponentArray(value: unknown): value is HardwareComponent[] {
  return Array.isArray(value) && value.every((v) => v && typeof v === "object" && "sku" in v && "historicalPrices" in v);
}

/** Normalized `component_id` per DEV-GUIDE.md §2 (e.g. `gpu_rtx_4070_12gb`). */
export function normalizeSku(name: string, category: string): string {
  const slug = `${category} ${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "unknown_component";
}
