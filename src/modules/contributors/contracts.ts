// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Contributors Hub — profile tiers, submission payloads, and verification.
 *
 * **Layer-1 contract**: type-only imports from `admin/contracts` (the
 * submission lifecycle is owned by moderation) and `scrapers/contracts` (the
 * provenance tag is owned by ingestion). Nothing is imported at runtime.
 *
 * Two shapes live here and must not be conflated:
 *   - `PriceSubmission`       the portal's INTERNAL canonical submission
 *   - `ContributorSubmission` the UPSTREAM wire shape this repo publishes
 * Adapters between them are at the bottom of this file, so an upstream schema
 * change is absorbed in one place instead of rippling through components.
 *
 * Mirrors `silicon-index-contributors.github.io`.
 */

import type { SubmissionStatus } from "../admin/contracts";
import type { SourceType } from "../scrapers/contracts";
import type { ComponentCategory, SpecsByCategory } from "../database/contracts";

export type { SubmissionStatus };

/* ------------------------------------------------------------------ */
/* Profile tiers                                                       */
/* ------------------------------------------------------------------ */

/**
 * `anonymous` — submitted signed out; identified only by a random per-browser
 *   pseudonymous id. Never auto-accepted.
 * `trusted`   — submitted while signed in; eligible for auto-accept.
 */
export type ContributorTier = "anonymous" | "trusted";

export interface ContributorProfile {
  /**
   * Reputation key this profile is aggregated under — the submitting
   * browser's `contributorHash`, or the account username when signed in.
   */
  contributorHash: string;
  /** Display handle: `anon-xxxxxxxx`, or the username. Never PII. */
  contributorId: string;
  tier: ContributorTier;
  /** 0–100. Derived from approved vs. denied/flagged submission history. */
  trustScore: number;
  verifiedSubmissions: number;
  lastApprovedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* Submission payload (internal canonical shape)                       */
/* ------------------------------------------------------------------ */

/**
 * Fields common to every submission, whatever the category.
 *
 * A submission is a PROPOSAL against the catalogue: it carries enough of the
 * base template (`database/contracts.ts`) to become a `CatalogComponent` on
 * approval, plus the observed price and its proof. It is never applied
 * directly — it stages as `pending` and an admin must approve it.
 */
export interface SubmissionBase {
  submissionId: string;
  /**
   * Persistent pseudonymous reputation key for the submitting browser
   * (`identity.ts`). Mandatory: every submission must be attributable to a
   * stable key, or a trust score cannot accrue.
   *
   * A random UUID — never PII, never derived from an IP or a fingerprint. It
   * is a pseudonym, not anonymity: it links this browser's submissions to one
   * another by design.
   */
  contributorHash: string;
  /** Normalized `component_id`; `componentName` is the display string. */
  sku: string;
  componentName: string;
  manufacturer: string;
  releaseYear: number;
  reportedPrice: number;
  currency: string;
  /** Mandatory proof of value — link to the completed transaction or listing. */
  proofUrl: string;
  status: SubmissionStatus;
  contributorId: string;
  contributorTier: ContributorTier;
  submittedAt: string;
  reviewedAt?: string;
  /** Set when `status === "denied"`. */
  denialReason?: string;
  /** Set when the auto-accept engine decided this submission. */
  autoAccepted?: boolean;
  /** Human-readable trace of the decision, for the audit trail. */
  decisionNote?: string;
}

export type SubmissionOf<C extends ComponentCategory> = SubmissionBase & {
  category: C;
  specs: SpecsByCategory[C];
};

/**
 * A staged price submission, discriminated on `category` exactly like
 * `CatalogComponent`. This is what links a contribution to the database
 * contracts: a GPU submission cannot carry a socket, because `GpuSpecs` has
 * none — the compiler rejects it before validation ever runs.
 */
export type PriceSubmission =
  | SubmissionOf<"CPU">
  | SubmissionOf<"GPU">
  | SubmissionOf<"RAM">
  | SubmissionOf<"MOBO">
  | SubmissionOf<"STORAGE">;

/** Fields a contributor supplies; the rest are assigned when staging. */
export type NewSubmissionInput =
  | Omit<SubmissionOf<"CPU">, "submissionId" | "status" | "submittedAt">
  | Omit<SubmissionOf<"GPU">, "submissionId" | "status" | "submittedAt">
  | Omit<SubmissionOf<"RAM">, "submissionId" | "status" | "submittedAt">
  | Omit<SubmissionOf<"MOBO">, "submissionId" | "status" | "submittedAt">
  | Omit<SubmissionOf<"STORAGE">, "submissionId" | "status" | "submittedAt">;

/* ------------------------------------------------------------------ */
/* Verification schemas                                                */
/* ------------------------------------------------------------------ */

export type VerificationCheck =
  | "proof_url_present"
  | "proof_url_wellformed"
  | "price_numeric_non_negative"
  | "sku_normalized"
  | "no_free_text_specs"
  | "release_year_plausible";

export const REQUIRED_VERIFICATION_CHECKS: VerificationCheck[] = [
  "proof_url_present",
  "proof_url_wellformed",
  "price_numeric_non_negative",
  "sku_normalized",
  "no_free_text_specs",
  "release_year_plausible"
];

export interface VerificationFailure {
  check: VerificationCheck;
  detail: string;
}

export type VerificationResult =
  | { verified: true }
  | { verified: false; failures: VerificationFailure[] };

/** Trust tiering thresholds applied to a derived profile. */
export interface TrustTierSpec {
  /** Minimum reviewed submissions before a trust score is meaningful. */
  minReviewedForScore: number;
  /** A contributor with nothing reviewed scores this, not a misleading 100. */
  unreviewedScore: 0;
}

export const TRUST_TIER_SPEC: TrustTierSpec = {
  minReviewedForScore: 1,
  unreviewedScore: 0
};

/**
 * Outbound payload consumed by `silicon-index-contributors.github.io`.
 * Whitelist-only per DEV-GUIDE.md §2 — no contributor PII beyond the
 * pseudonymous id and tier.
 */
export interface ContributorSchemaPayload {
  schema_version: 1;
  submission_id: string;
  component_id: string;
  price_amount: number;
  currency: string;
  timestamp: string;
  source_type: SourceType;
  proof_url: string;
  contributor: { id: string; hash: string; tier: ContributorTier };
  status: SubmissionStatus;
  review: { reviewed_at: string | null; auto_accepted: boolean; note: string | null };
}

/* ------------------------------------------------------------------ */
/* Upstream wire shape + adapters                                      */
/* ------------------------------------------------------------------ */

/**
 * The shape this module's repo publishes. Differs from the internal model:
 * `submittedAt` is a numeric epoch upstream, an ISO 8601 string internally.
 */
export interface ContributorSubmission {
  id: string;
  /** Reputation key, mirrored from the internal model. */
  contributorHash: string;
  sku: string;
  reportedPrice: number;
  currency: string;
  proofUrl: string;
  /** Unix epoch milliseconds. */
  submittedAt: number;
  contributorTier: ContributorTier;
  status: SubmissionStatus;
}

/**
 * Adapts an upstream record into the portal's internal model.
 *
 * The upstream wire shape carries no catalogue detail, so the caller supplies
 * it — including the category and its matching specs, which the generic ties
 * together so a GPU cannot arrive with CPU specs.
 */
export function toPriceSubmission<C extends ComponentCategory>(
  upstream: ContributorSubmission,
  details: {
    componentName: string;
    manufacturer: string;
    releaseYear: number;
    contributorId: string;
    contributorHash: string;
    category: C;
    specs: SpecsByCategory[C];
  }
): SubmissionOf<C> {
  return {
    submissionId: upstream.id,
    sku: upstream.sku,
    reportedPrice: upstream.reportedPrice,
    currency: upstream.currency,
    proofUrl: upstream.proofUrl,
    submittedAt: new Date(upstream.submittedAt).toISOString(),
    contributorTier: upstream.contributorTier,
    status: upstream.status,
    ...details
  };
}

/** Adapts an internal submission into the upstream wire shape. */
export function toContributorSubmission(submission: PriceSubmission): ContributorSubmission {
  return {
    id: submission.submissionId,
    contributorHash: submission.contributorHash,
    sku: submission.sku,
    reportedPrice: submission.reportedPrice,
    currency: submission.currency,
    proofUrl: submission.proofUrl,
    submittedAt: new Date(submission.submittedAt).getTime(),
    contributorTier: submission.contributorTier,
    status: submission.status
  };
}
