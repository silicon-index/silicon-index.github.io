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

/**
 * Normalizes the local `mock-data.json` shape into `HardwareComponent`.
 *
 * The switch is not ceremony: `specs` is a discriminated union, so narrowing
 * on `category` is what lets the compiler prove each variant is built with the
 * spec shape that belongs to it. A cast here would defeat the contract.
 */
export function toHardwareComponent(entry: ComponentEntry): HardwareComponent {
  const base = {
    sku: entry.id,
    name: entry.name,
    manufacturer: entry.manufacturer,
    releaseYear: entry.releaseYear,
    originalMSRP: entry.originalMSRP,
    currency: entry.currency,
    medianMarketPrice: entry.marketPrice,
    historicalPrices: entry.priceHistory.map((p) => [monthToTimestamp(p.month), p.price] as PricePointTuple),
    fairValueScore: entry.fairValueScore
  };

  switch (entry.category) {
    case "CPU":
      return { ...base, category: "CPU", specs: entry.specs };
    case "GPU":
      return { ...base, category: "GPU", specs: entry.specs };
    case "RAM":
      return { ...base, category: "RAM", specs: entry.specs };
    case "MOBO":
      return { ...base, category: "MOBO", specs: entry.specs };
    case "STORAGE":
      return { ...base, category: "STORAGE", specs: entry.specs };
  }
}

export function isHardwareComponentArray(value: unknown): value is HardwareComponent[] {
  return Array.isArray(value) && value.every((v) => v && typeof v === "object" && "sku" in v && "historicalPrices" in v);
}
