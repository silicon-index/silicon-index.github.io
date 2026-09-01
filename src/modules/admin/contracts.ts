// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Admin Dashboard — moderation contracts.
 *
 * Pure types, no runtime imports. This is a **layer-0 contract**: it depends on
 * nothing, so any module may import it without risking a cycle. The submission
 * lifecycle is owned here because its states are moderation outcomes.
 *
 * Mirrors `silicon-index-admin-dashboard.github.io`.
 */

/** Lifecycle of a price submission, from staging to moderator decision. */
export type SubmissionStatus = "pending" | "approved" | "denied" | "flagged";

/** Runtime tuple of the lifecycle, for SQL enums and validation. */
export const SUBMISSION_STATUSES = ["pending", "approved", "denied", "flagged"] as const satisfies
  readonly SubmissionStatus[];

/** Action a moderator (or the auto-accept engine) applies to a submission. */
export type ModerationAction = "approve" | "deny" | "flag" | "reopen";

/** Canonical denial reason tags. Free text is deliberately not accepted. */
export const DENIAL_REASONS = [
  "Unverifiable proof URL",
  "Price outside plausible market range",
  "Duplicate submission",
  "Wrong component / SKU mismatch",
  "Unwhitelisted seller or source",
  "Violates data whitelist (PII or free text)"
] as const;

export type DenialReason = (typeof DENIAL_REASONS)[number];

/** A moderation decision recorded against a submission. */
export interface ModerationDecision {
  submissionId: string;
  action: ModerationAction;
  /** Required when `action === "deny"`. */
  reason?: DenialReason | string;
  /** True when the auto-accept engine decided this, not a person. */
  automated: boolean;
  decidedAt: string;
  note?: string;
}

/**
 * Specification of the auto-accept rule set.
 *
 * Every condition must hold for a submission to be approved automatically;
 * anything else is left for a human. Encoded as data so the rule set is
 * inspectable and testable rather than buried in a function body.
 */
export interface AutoAcceptRuleSpec {
  /** Only this contributor tier is eligible. */
  requiredTier: "trusted";
  /** Maximum absolute deviation from the historical moving median (0.15 = ±15%). */
  tolerance: number;
  /** A SKU with no historical series is never auto-accepted. */
  requiresHistoricalSeries: true;
  /** Statistic the reported price is compared against. */
  baseline: "moving_median";
}

export const AUTO_ACCEPT_RULES: AutoAcceptRuleSpec = {
  requiredTier: "trusted",
  tolerance: 0.15,
  requiresHistoricalSeries: true,
  baseline: "moving_median"
};

/** Outcome of running the engine across the pending queue. */
export interface AutoAcceptRunSummary {
  approvedCount: number;
  skippedCount: number;
  /** Why the first skipped submission was skipped, for operator feedback. */
  firstSkipReason?: string;
}
