// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Market Database — STAGING schema (untrusted quarantine).
 *
 * ────────────────────────────────────────────────────────────────────────
 * AIRGAP: this is the only table the public `/contribute` path may write to.
 * It is a blind sink — a submission lands here as `pending` and is inert.
 * Nothing reads it as catalogue data, and no foreign key ties it to the core
 * tables, so a poisoned row cannot corrupt the index by reference either.
 *
 * The absence of an FK to `components.sku` is deliberate. A submission may
 * name a SKU that does not exist yet (a genuinely new part), and an FK here
 * would both reject those and hand an attacker a probe for which SKUs exist.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Promotion into `core.ts` happens only after moderation, in a separate code
 * path with different privileges — never as a side effect of a public write.
 */

import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { COMPONENT_CATEGORIES, type ComponentSpecs } from "../contracts";
import { SUBMISSION_STATUSES } from "../../admin/contracts";
import type { ContributorTier } from "../../contributors/contracts";

const CONTRIBUTOR_TIERS = ["anonymous", "trusted"] as const satisfies readonly ContributorTier[];

/** Staged submissions from `/contribute`. Untrusted until a moderator acts. */
export const submissions = sqliteTable(
  "submissions",
  {
    submissionId: text("submission_id").primaryKey(),
    /** Persistent pseudonymous reputation key. Never PII. */
    contributorHash: text("contributor_hash").notNull(),
    /** Display handle: `anon-xxxxxxxx`, or an account username. */
    contributorId: text("contributor_id").notNull(),
    contributorTier: text("contributor_tier", { enum: CONTRIBUTOR_TIERS }).notNull().default("anonymous"),

    /** Proposed catalogue identity. No FK — see the airgap note above. */
    sku: text("sku").notNull(),
    componentName: text("component_name").notNull(),
    manufacturer: text("manufacturer").notNull(),
    releaseYear: integer("release_year").notNull(),
    category: text("category", { enum: COMPONENT_CATEGORIES }).notNull(),
    specs: text("specs", { mode: "json" }).$type<ComponentSpecs>().notNull(),

    reportedPrice: real("reported_price").notNull(),
    currency: text("currency").notNull().default("USD"),
    /** Mandatory proof of value. */
    proofUrl: text("proof_url").notNull(),

    /** Always starts pending; a public write can never set anything else. */
    status: text("status", { enum: SUBMISSION_STATUSES }).notNull().default("pending"),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    /** Canonical tag from `DENIAL_REASONS`; set when status is `denied`. */
    denialReason: text("denial_reason"),
    autoAccepted: integer("auto_accepted", { mode: "boolean" }).notNull().default(false),
    decisionNote: text("decision_note")
  },
  (table) => [
    // The moderation queue reads by status, oldest first.
    index("submissions_status_submitted_idx").on(table.status, table.submittedAt),
    // Reputation aggregates by hash, never by the truncated display handle.
    index("submissions_contributor_hash_idx").on(table.contributorHash),
    index("submissions_sku_idx").on(table.sku)
  ]
);

export type SubmissionRow = typeof submissions.$inferSelect;
export type NewSubmissionRow = typeof submissions.$inferInsert;

/** Staging tables only. Never merge this with the core schema. */
export const stagingSchema = { submissions };
