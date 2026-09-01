// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Contributors module — registry derivation and the outbound submission schema.
 *
 * Mirrors the responsibility of `silicon-index-contributors.github.io`:
 * contributor tiers, trust metrics, and the submission template that repo is
 * expected to consume. The wire shape itself lives in `./contracts.ts`.
 */

import type {
  ContributorProfile,
  ContributorSchemaPayload,
  ContributorTier,
  PriceSubmission
} from "./contracts";

export type { ContributorSchemaPayload };

/**
 * Derives contributor profiles from submission history.
 * Trust score = approved / (approved + denied + flagged), scaled to 0–100;
 * a contributor with no reviewed submissions scores 0 rather than 100.
 */
export function buildContributorRegistry(submissions: PriceSubmission[]): ContributorProfile[] {
  // Keyed on the full hash, not the truncated display handle: two contributors
  // could share a handle prefix, and merging their reputations would hand one
  // of them a score they never earned.
  const byId = new Map<
    string,
    { approved: number; rejected: number; tier: ContributorTier; last: string | null; handle: string }
  >();

  submissions.forEach((s) => {
    const key = s.contributorHash || s.contributorId;
    const current = byId.get(key) ?? {
      approved: 0,
      rejected: 0,
      tier: s.contributorTier,
      last: null,
      handle: s.contributorId
    };
    if (s.status === "approved") {
      current.approved += 1;
      if (!current.last || new Date(s.reviewedAt ?? 0) > new Date(current.last)) current.last = s.reviewedAt ?? null;
    } else if (s.status === "denied" || s.status === "flagged") {
      current.rejected += 1;
    }
    // A contributor is "trusted" if any submission was made while signed in.
    if (s.contributorTier === "trusted") current.tier = "trusted";
    byId.set(key, current);
  });

  return Array.from(byId.entries())
    .map(([contributorHash, v]) => {
      const reviewed = v.approved + v.rejected;
      return {
        contributorHash,
        contributorId: v.handle,
        tier: v.tier,
        trustScore: reviewed === 0 ? 0 : Math.round((v.approved / reviewed) * 100),
        verifiedSubmissions: v.approved,
        lastApprovedAt: v.last
      };
    })
    .sort((a, b) => b.trustScore - a.trustScore || b.verifiedSubmissions - a.verifiedSubmissions);
}

/** Builds the outbound payload defined in `./contracts.ts`. */
export function toContributorSchema(submission: PriceSubmission): ContributorSchemaPayload {
  return {
    schema_version: 1,
    submission_id: submission.submissionId,
    component_id: submission.sku,
    price_amount: submission.reportedPrice,
    currency: submission.currency,
    timestamp: submission.submittedAt,
    source_type: "marketplace_avg",
    proof_url: submission.proofUrl,
    contributor: {
      id: submission.contributorId,
      hash: submission.contributorHash,
      tier: submission.contributorTier
    },
    status: submission.status,
    review: {
      reviewed_at: submission.reviewedAt ?? null,
      auto_accepted: submission.autoAccepted ?? false,
      note: submission.decisionNote ?? submission.denialReason ?? null
    }
  };
}
