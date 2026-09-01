# Silicon Index — Database Schemas (stub)

- **Target repo:** `https://github.com/silicon-index/silicon-index-market-database.github.io`
- **Branch:** `dev`
- **Nav id:** `database` (see `src/config/navigation.ts`)

MongoDB schemas, hardware validation models, and PITR recovery

This directory is a documentation + contract stub inside the frontend repo. The
module itself lives in its own repository; nothing here is a copy of it.

## Contents

- `contracts.ts` — `HardwareComponent` (SKU, MSRP, median price, `historicalPrices`),
  `PricePointTuple`, the raw `ComponentEntry` shape, and the validation models
  (`FieldConstraint`, `HARDWARE_CONSTRAINTS`, `ValidationResult`).
- `adapters.ts` — `toHardwareComponent()`, `normalizeSku()`, `isHardwareComponentArray()`.
- `schemas.ts` — upstream `HardwareSchema` (brand/model/`releaseDate`) plus an adapter.
