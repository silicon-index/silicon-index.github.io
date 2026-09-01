// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Market Database — CORE schema (trusted production index).
 *
 * ────────────────────────────────────────────────────────────────────────
 * AIRGAP: these tables are the trusted index. Nothing reachable from the
 * public `/contribute` path may import this file. A submission reaches these
 * tables only after a moderator approves it, through a promotion step that
 * runs with different privileges — never as a side effect of a public write.
 *
 * `scripts/check-architecture.mjs` fails the build if a staging-only module
 * reaches this file, directly or transitively.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Dialect is `drizzle-orm/sqlite-core`, which LibSQL and Cloudflare D1 both
 * speak, so the same queries run in a container and at the edge.
 */

import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { COMPONENT_CATEGORIES, type ComponentSpecs } from "../contracts";
import type { ContributorTier } from "../../contributors/contracts";

const CONTRIBUTOR_TIERS = ["anonymous", "trusted"] as const satisfies readonly ContributorTier[];

/**
 * `CatalogComponent` + `MarketState`, i.e. `HardwareComponent`.
 *
 * The polymorphic `specs` object is a JSON text column: SQLite has no union
 * type, and a table per category would fragment every query for a
 * discriminator the application already enforces. `category` stays a real SQL
 * enum so the discriminant itself is constrained by the database.
 */
export const components = sqliteTable(
  "components",
  {
    /** Normalized `component_id` per DEV-GUIDE.md §2. */
    sku: text("sku").primaryKey(),
    name: text("name").notNull(),
    category: text("category", { enum: COMPONENT_CATEGORIES }).notNull(),
    manufacturer: text("manufacturer").notNull(),
    releaseYear: integer("release_year").notNull(),
    /** Nullable on purpose: plenty of vintage parts have no documented MSRP. */
    originalMSRP: real("original_msrp"),
    currency: text("currency").notNull().default("USD"),
    specs: text("specs", { mode: "json" }).$type<ComponentSpecs>().notNull(),
    medianMarketPrice: real("median_market_price").notNull().default(0),
    fairValueScore: real("fair_value_score").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
  },
  (table) => [
    index("components_category_idx").on(table.category),
    index("components_manufacturer_idx").on(table.manufacturer),
    index("components_release_year_idx").on(table.releaseYear)
  ]
);

/**
 * Price series, one row per observation.
 *
 * Rows rather than a JSON array: this is the unbounded, range-scanned table
 * and the landing zone for scraper output. `historicalPrices` is assembled
 * from here.
 */
export const priceObservations = sqliteTable(
  "price_observations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sku: text("sku")
      .notNull()
      .references(() => components.sku, { onDelete: "cascade" }),
    /** Unix ms, matching `PricePointTuple[0]`. */
    observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
    price: real("price").notNull(),
    currency: text("currency").notNull().default("USD"),
    sourceType: text("source_type", { enum: ["retail", "marketplace_avg", "refurbished"] }),
    storeId: text("store_id")
  },
  (table) => [index("price_observations_sku_observed_idx").on(table.sku, table.observedAt)]
);

/**
 * Derived contributor reputation.
 *
 * Trusted, and therefore core: a row here is written only after moderation,
 * never by a contributor. Keyed on `contributorHash` — two contributors can
 * share a truncated display handle, and keying on that would merge them.
 */
export const contributors = sqliteTable("contributors", {
  contributorHash: text("contributor_hash").primaryKey(),
  contributorId: text("contributor_id").notNull(),
  tier: text("tier", { enum: CONTRIBUTOR_TIERS }).notNull().default("anonymous"),
  /** 0–100: approved / (approved + denied + flagged). */
  trustScore: integer("trust_score").notNull().default(0),
  verifiedSubmissions: integer("verified_submissions").notNull().default(0),
  lastApprovedAt: integer("last_approved_at", { mode: "timestamp_ms" })
});

export type ComponentRow = typeof components.$inferSelect;
export type NewComponentRow = typeof components.$inferInsert;
export type PriceObservationRow = typeof priceObservations.$inferSelect;
export type NewPriceObservationRow = typeof priceObservations.$inferInsert;
export type ContributorRow = typeof contributors.$inferSelect;
export type NewContributorRow = typeof contributors.$inferInsert;

/** Core tables only. Never merge this with the staging schema. */
export const coreSchema = { components, priceObservations, contributors };
