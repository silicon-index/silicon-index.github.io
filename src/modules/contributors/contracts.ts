/**
 * Wire contract published by `silicon-index-contributors.github.io` (`dev`).
 *
 * This is the UPSTREAM shape, deliberately kept separate from the portal's
 * internal `PriceSubmission` model in `src/services/dataService.ts`. Keeping
 * the boundary explicit means an upstream schema change is absorbed by the
 * adapter below instead of rippling through every component.
 *
 * Notable difference from the internal model: upstream carries `submittedAt`
 * as a numeric epoch, the portal uses an ISO 8601 string.
 */

import type { ContributorTier, PriceSubmission, SubmissionStatus } from "../../services/dataService";

export interface ContributorSubmission {
  id: string;
  sku: string;
  reportedPrice: number;
  currency: string;
  proofUrl: string;
  /** Unix epoch milliseconds. */
  submittedAt: number;
  contributorTier: ContributorTier;
  status: SubmissionStatus;
}

/** Adapts an upstream record into the portal's internal model. */
export function toPriceSubmission(
  upstream: ContributorSubmission,
  details: Pick<PriceSubmission, "componentName" | "category" | "socket" | "generation" | "releaseYear" | "contributorId">
): PriceSubmission {
  return {
    submissionId: upstream.id,
    sku: upstream.sku,
    reportedPrice: upstream.reportedPrice,
    currency: upstream.currency,
    proofUrl: upstream.proofUrl,
    submittedAt: new Date(upstream.submittedAt).toISOString(),
    contributorTier: upstream.contributorTier,
    status: upstream.status,
    tdpWatts: null,
    ...details
  };
}

/** Adapts an internal submission into the upstream wire shape. */
export function toContributorSubmission(submission: PriceSubmission): ContributorSubmission {
  return {
    id: submission.submissionId,
    sku: submission.sku,
    reportedPrice: submission.reportedPrice,
    currency: submission.currency,
    proofUrl: submission.proofUrl,
    submittedAt: new Date(submission.submittedAt).getTime(),
    contributorTier: submission.contributorTier,
    status: submission.status
  };
}
