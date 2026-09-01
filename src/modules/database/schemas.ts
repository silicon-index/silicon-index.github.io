/**
 * Wire contract published by `silicon-index-market-database.github.io` (`dev`).
 *
 * The UPSTREAM hardware record. The portal's internal model is
 * `HardwareComponent` in `src/services/dataService.ts`; this stays separate so
 * an upstream schema change is absorbed by the adapter below.
 *
 * Notable differences from the internal model: upstream splits `brand`/`model`
 * where the portal carries a single display `name`, and dates a component by
 * `releaseDate` rather than `releaseYear`.
 */

import type { HardwareComponent, PricePointTuple } from "../../services/dataService";

export type HardwareCategory = "GPU" | "CPU" | "RAM" | "Storage" | "Motherboard";

export interface HardwareSchema {
  sku: string;
  brand: string;
  model: string;
  category: HardwareCategory;
  msrp: number;
  currency: string;
  /** ISO 8601 date. */
  releaseDate: string;
}

/** Optional companion series published alongside the hardware record. */
export interface HardwarePriceSeries {
  sku: string;
  observations: PricePointTuple[];
}

/**
 * Adapts an upstream record into the portal's internal model.
 * Fields the upstream schema does not carry (socket, generation, TDP, fair
 * value) must be supplied by the caller — the portal never invents them.
 */
export function toHardwareComponent(
  upstream: HardwareSchema,
  series: PricePointTuple[],
  supplemental: Pick<HardwareComponent, "socket" | "generation" | "tdpWatts" | "fairValueScore" | "medianMarketPrice">
): HardwareComponent {
  return {
    sku: upstream.sku,
    name: `${upstream.brand} ${upstream.model}`.trim(),
    category: upstream.category,
    msrp: upstream.msrp,
    currency: upstream.currency,
    historicalPrices: series,
    releaseYear: new Date(upstream.releaseDate).getUTCFullYear(),
    ...supplemental
  };
}
