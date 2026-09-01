/**
 * AI Models — anomaly detection and fair-value scoring contracts.
 *
 * **Layer-1 contract**: type-only imports from `database/contracts` (the
 * hardware record) and `contributors/contracts` (the submission). Nothing is
 * imported at runtime. `./engine.ts` implements these interfaces.
 *
 * Mirrors `silicon-index-ai.github.io`.
 */

import type { HardwareComponent, PricePointTuple } from "../database/contracts";
import type { PriceSubmission } from "../contributors/contracts";

/* ------------------------------------------------------------------ */
/* Fair-value scoring                                                  */
/* ------------------------------------------------------------------ */

/**
 * Scoring must stay mathematically deterministic and free from vendor bias
 * (DEV-GUIDE.md §1), so the input carries only observable quantities.
 */
export interface FairValueInput {
  sku: string;
  /** Launch MSRP; null when no launch price is documented. */
  msrp: number | null;
  /** Chronological observations, oldest first. */
  historicalPrices: PricePointTuple[];
  releaseYear: number;
}

export interface FairValueOutput {
  sku: string;
  /** The deterministic fair-value index. */
  fairValueScore: number;
  /** Statistics the score was derived from, for auditability. */
  basis: {
    movingMedian: number | null;
    observationCount: number;
  };
}

export interface FairValueScorer {
  score(input: FairValueInput): FairValueOutput;
}

/* ------------------------------------------------------------------ */
/* Anomaly detection                                                   */
/* ------------------------------------------------------------------ */

export type AnomalyKind =
  | "none"
  | "above_market"
  | "below_market"
  | "no_baseline"
  | "implausible_value";

/** A reported price checked against a component's own history. */
export interface AnomalyDetectionInput {
  sku: string;
  reportedPrice: number;
  currency: string;
  historicalPrices: PricePointTuple[];
}

export interface AnomalyDetectionOutput {
  sku: string;
  kind: AnomalyKind;
  /** True when the deviation exceeds the configured tolerance. */
  isAnomaly: boolean;
  /** Baseline the price was compared against. */
  movingMedian: number | null;
  /** Signed deviation from the baseline as a ratio (0.08 === +8%). */
  deviation: number | null;
  /** Human-readable explanation, surfaced to moderators. */
  reason: string;
}

export interface AnomalyDetector {
  detect(input: AnomalyDetectionInput): AnomalyDetectionOutput;
}

/* ------------------------------------------------------------------ */
/* Auto-accept decision                                                */
/* ------------------------------------------------------------------ */

/**
 * Result of applying the auto-accept rule set to one submission.
 * The rule set itself is specified in `admin/contracts.ts`
 * (`AUTO_ACCEPT_RULES`) — this is the per-submission verdict.
 */
export interface AutoAcceptDecision {
  accept: boolean;
  /** Median of the component's historical series, or null when unavailable. */
  movingMedian: number | null;
  /** Signed deviation from the median as a ratio (0.08 === +8%). */
  deviation: number | null;
  reason: string;
}

export interface AutoAcceptEvaluator {
  evaluate(submission: PriceSubmission, components: HardwareComponent[]): AutoAcceptDecision;
}
