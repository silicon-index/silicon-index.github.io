/**
 * Wire contract published by `silicon-index-market-database.github.io` (`dev`).
 *
 * The UPSTREAM hardware record. The portal's internal model is
 * `HardwareComponent` in `./contracts.ts`; this stays separate so an upstream
 * schema change is absorbed by the adapter below.
 *
 * Notable differences from the internal model: upstream splits `brand`/`model`
 * where the portal carries `manufacturer` plus a display `name`, dates a
 * component by `releaseDate` rather than `releaseYear`, and spells categories
 * in long form.
 */

import { CATEGORY_ALIASES, type ComponentSpecs, type HardwareComponent, type PricePointTuple } from "./contracts";

/** Long-form category labels as published upstream. */
export type HardwareCategory = "GPU" | "CPU" | "RAM" | "Storage" | "Motherboard";

export interface HardwareSchema {
  sku: string;
  brand: string;
  model: string;
  category: HardwareCategory;
  /** Launch MSRP; null when the upstream record documents none. */
  msrp: number | null;
  currency: string;
  /** ISO 8601 date. */
  releaseDate: string;
  /** Category-specific attributes, primitives only. */
  specs?: ComponentSpecs;
}

/** Optional companion series published alongside the hardware record. */
export interface HardwarePriceSeries {
  sku: string;
  observations: PricePointTuple[];
}

/**
 * Adapts an upstream record into the portal's internal model.
 *
 * Fields the upstream schema does not carry (fair value, median price) must be
 * supplied by the caller — the portal never invents them. Returns null when
 * the upstream category is unrecognized, rather than guessing and silently
 * misfiling the part.
 */
export function toHardwareComponent(
  upstream: HardwareSchema,
  series: PricePointTuple[],
  supplemental: Pick<HardwareComponent, "fairValueScore" | "medianMarketPrice">
): HardwareComponent | null {
  const category = CATEGORY_ALIASES[upstream.category.trim().toLowerCase()];
  if (!category) return null;

  return {
    sku: upstream.sku,
    name: `${upstream.brand} ${upstream.model}`.trim(),
    category,
    manufacturer: upstream.brand,
    releaseYear: new Date(upstream.releaseDate).getUTCFullYear(),
    originalMSRP: upstream.msrp,
    currency: upstream.currency,
    specs: upstream.specs ?? {},
    historicalPrices: series,
    ...supplemental
  };
}
