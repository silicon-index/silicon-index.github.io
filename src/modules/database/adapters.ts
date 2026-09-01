/**
 * Market Database module — normalization between stored records and the
 * canonical model.
 *
 * The upstream wire shape lives in `./schemas.ts`; bulk ingestion in
 * `./ingest.ts`; this file handles the portal's own dataset.
 */

import type { ComponentEntry, HardwareComponent, PricePointTuple } from "./contracts";

// One definition, owned by the ingestion pipeline that also produces SKUs.
export { normalizeSku } from "./ingest";

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
    manufacturer: entry.manufacturer,
    releaseYear: entry.releaseYear,
    originalMSRP: entry.originalMSRP,
    currency: entry.currency,
    specs: entry.specs ?? {},
    medianMarketPrice: entry.marketPrice,
    historicalPrices: entry.priceHistory.map((p) => [monthToTimestamp(p.month), p.price] as PricePointTuple),
    fairValueScore: entry.fairValueScore
  };
}

export function isHardwareComponentArray(value: unknown): value is HardwareComponent[] {
  return Array.isArray(value) && value.every((v) => v && typeof v === "object" && "sku" in v && "historicalPrices" in v);
}
