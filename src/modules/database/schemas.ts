// SPDX-License-Identifier: AGPL-3.0-or-later
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

import type { ComponentCategory, HardwareComponent, PricePointTuple, SpecsByCategory } from "./contracts";

/** Long-form category labels as published upstream. */
export type HardwareCategory = "GPU" | "CPU" | "RAM" | "Storage" | "Motherboard";

interface SchemaBase {
  sku: string;
  brand: string;
  model: string;
  /** Launch MSRP; null when the upstream record documents none. */
  msrp: number | null;
  currency: string;
  /** ISO 8601 date. */
  releaseDate: string;
}

type SchemaOf<C extends ComponentCategory, Label extends HardwareCategory> = SchemaBase & {
  category: Label;
  specs: SpecsByCategory[C];
};

/** Discriminated upstream record, so specs cannot be paired with the wrong category. */
export type HardwareSchema =
  | SchemaOf<"CPU", "CPU">
  | SchemaOf<"GPU", "GPU">
  | SchemaOf<"RAM", "RAM">
  | SchemaOf<"MOBO", "Motherboard">
  | SchemaOf<"STORAGE", "Storage">;

/** Optional companion series published alongside the hardware record. */
export interface HardwarePriceSeries {
  sku: string;
  observations: PricePointTuple[];
}

/**
 * Adapts an upstream record into the portal's internal model.
 *
 * Fields the upstream schema does not carry (fair value, median price) must be
 * supplied by the caller — the portal never invents them.
 */
export function toHardwareComponent(
  upstream: HardwareSchema,
  series: PricePointTuple[],
  supplemental: Pick<HardwareComponent, "fairValueScore" | "medianMarketPrice">
): HardwareComponent {
  const base = {
    sku: upstream.sku,
    name: `${upstream.brand} ${upstream.model}`.trim(),
    manufacturer: upstream.brand,
    releaseYear: new Date(upstream.releaseDate).getUTCFullYear(),
    originalMSRP: upstream.msrp,
    currency: upstream.currency,
    historicalPrices: series,
    ...supplemental
  };

  switch (upstream.category) {
    case "CPU":
      return { ...base, category: "CPU", specs: upstream.specs };
    case "GPU":
      return { ...base, category: "GPU", specs: upstream.specs };
    case "RAM":
      return { ...base, category: "RAM", specs: upstream.specs };
    case "Motherboard":
      return { ...base, category: "MOBO", specs: upstream.specs };
    case "Storage":
      return { ...base, category: "STORAGE", specs: upstream.specs };
  }
}
