/**
 * Moderation actions over the locally staged submission queue.
 *
 * Admin Dashboard module — the state transitions a moderator (or the
 * auto-accept engine) applies to a submission. The service layer owns
 * transport and storage; `modules/ai/engine.ts` owns the accept rules; this
 * owns moderation itself.
 *
 * Demo constraint unchanged: the queue lives in `localStorage`, so moderation
 * decisions are per-browser until the Phase 5 backend lands.
 */

import { evaluateAutoAccept } from "../ai/engine";
import { readStaged, writeStaged } from "../../services/dataService";
import type { AutoAcceptDecision } from "../ai/contracts";
import type { HardwareComponent } from "../database/contracts";
import type { PriceSubmission } from "../contributors/contracts";
import { DENIAL_REASONS, type DenialReason, type SubmissionStatus } from "./contracts";

export { DENIAL_REASONS };
export type { DenialReason };

export function getSubmissions(): PriceSubmission[] {
  return readStaged();
}

export function getByStatus(status: SubmissionStatus): PriceSubmission[] {
  return readStaged().filter((s) => s.status === status);
}

/** Queue a moderator sees: pending first, then anything flagged for anomaly checks. */
export function getReviewQueue(): PriceSubmission[] {
  return readStaged()
    .filter((s) => s.status === "pending" || s.status === "flagged")
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
}

export function getReviewed(): PriceSubmission[] {
  return readStaged()
    .filter((s) => s.status === "approved" || s.status === "denied")
    .sort((a, b) => new Date(b.reviewedAt ?? 0).getTime() - new Date(a.reviewedAt ?? 0).getTime());
}

function update(submissionId: string, patch: Partial<PriceSubmission>): PriceSubmission | null {
  const all = readStaged();
  const index = all.findIndex((s) => s.submissionId === submissionId);
  if (index === -1) return null;
  all[index] = { ...all[index], ...patch, reviewedAt: new Date().toISOString() };
  writeStaged(all);
  return all[index];
}

/** Commits the price observation to the active index stage. */
export function approve(submissionId: string, note?: string): PriceSubmission | null {
  return update(submissionId, {
    status: "approved",
    autoAccepted: false,
    decisionNote: note ?? "Approved by moderator.",
    denialReason: undefined
  });
}

/** Rejects the submission with a reason tag. */
export function deny(submissionId: string, reason: DenialReason | string): PriceSubmission | null {
  return update(submissionId, {
    status: "denied",
    autoAccepted: false,
    denialReason: reason,
    decisionNote: `Denied by moderator: ${reason}`
  });
}

/** Flags the submission for anomaly checks; it stays in the review queue. */
export function flag(submissionId: string, note?: string): PriceSubmission | null {
  return update(submissionId, {
    status: "flagged",
    autoAccepted: false,
    decisionNote: note ?? "Flagged for anomaly review."
  });
}

/** Returns a flagged/denied submission to the pending queue. */
export function reopen(submissionId: string): PriceSubmission | null {
  return update(submissionId, {
    status: "pending",
    denialReason: undefined,
    decisionNote: "Reopened for review."
  });
}

export interface AutoAcceptRunResult {
  approved: PriceSubmission[];
  skipped: { submission: PriceSubmission; decision: AutoAcceptDecision }[];
}

/**
 * Runs the auto-accept engine across every pending submission.
 * Only Trusted Contributors within ±15% of the historical moving median are
 * approved; everything else is left untouched for a human, with the reason
 * recorded so the moderator can see why it was skipped.
 */
export function runAutoAcceptEngine(components: HardwareComponent[]): AutoAcceptRunResult {
  const all = readStaged();
  const result: AutoAcceptRunResult = { approved: [], skipped: [] };
  let mutated = false;

  all.forEach((submission, index) => {
    if (submission.status !== "pending") return;
    const decision = evaluateAutoAccept(submission, components);

    if (decision.accept) {
      all[index] = {
        ...submission,
        status: "approved",
        autoAccepted: true,
        decisionNote: `Auto-accepted: ${decision.reason}`,
        reviewedAt: new Date().toISOString()
      };
      result.approved.push(all[index]);
      mutated = true;
    } else {
      result.skipped.push({ submission, decision });
    }
  });

  if (mutated) writeStaged(all);
  return result;
}
