/**
 * AI Models module — portal-side valuation and anomaly logic.
 *
 * Mirrors the responsibility of `silicon-index-ai.github.io`: price anomaly
 * detection and fair-value scoring. Until that engine is live and served from
 * the backend, the deterministic rules below run client-side.
 *
 * Implements the interfaces in `./contracts.ts`. Imports only other module
 * contracts (all type-only except the rule spec), so it never forms a cycle
 * with the service layer that calls it.
 */

import type { HardwareComponent } from "../database/contracts";
import type { PriceSubmission } from "../contributors/contracts";
import type {
  AnomalyDetectionInput,
  AnomalyDetectionOutput,
  AutoAcceptDecision,
  FairValueInput,
  FairValueOutput
} from "./contracts";
import { AUTO_ACCEPT_RULES } from "../admin/contracts";

/** Tolerance comes from the rule spec in `admin/contracts.ts`. */
export const AUTO_ACCEPT_TOLERANCE = AUTO_ACCEPT_RULES.tolerance;

export type { AutoAcceptDecision };

/** Median of a numeric series (mean of the two middle values when even). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Fair-value scoring — implements `FairValueScorer` from `./contracts.ts`.
 *
 * Deterministic and vendor-neutral (DEV-GUIDE.md §1): the score is the
 * component's own moving median, anchored to MSRP when no observations exist.
 * `basis` is returned alongside so any score can be audited back to the
 * numbers that produced it.
 */
export function scoreFairValue(input: FairValueInput): FairValueOutput {
  const prices = input.historicalPrices.map(([, price]) => price).filter((p) => Number.isFinite(p));
  const movingMedian = median(prices);

  return {
    sku: input.sku,
    fairValueScore: movingMedian === null ? (input.msrp ?? 0) : Math.round(movingMedian),
    basis: { movingMedian, observationCount: prices.length }
  };
}

/**
 * Anomaly detection — implements `AnomalyDetector` from `./contracts.ts`.
 *
 * Compares a reported price against the component's own historical moving
 * median. Deterministic and vendor-neutral by construction: the only inputs
 * are the component's own observations.
 */
export function detectAnomaly(input: AnomalyDetectionInput): AnomalyDetectionOutput {
  if (input.reportedPrice < 0 || !Number.isFinite(input.reportedPrice)) {
    return {
      sku: input.sku,
      kind: "implausible_value",
      isAnomaly: true,
      movingMedian: null,
      deviation: null,
      reason: "Reported price is negative or not a finite number."
    };
  }

  const movingMedian = median(input.historicalPrices.map(([, price]) => price));
  if (movingMedian === null || movingMedian <= 0) {
    return {
      sku: input.sku,
      kind: "no_baseline",
      isAnomaly: false,
      movingMedian,
      deviation: null,
      reason: "No historical baseline for this SKU — cannot assess."
    };
  }

  const deviation = (input.reportedPrice - movingMedian) / movingMedian;
  const isAnomaly = Math.abs(deviation) > AUTO_ACCEPT_TOLERANCE;
  const pct = (deviation * 100).toFixed(1);

  return {
    sku: input.sku,
    kind: !isAnomaly ? "none" : deviation > 0 ? "above_market" : "below_market",
    isAnomaly,
    movingMedian,
    deviation,
    reason: isAnomaly
      ? `${pct}% from the ${movingMedian.toFixed(2)} moving median — outside ±${(AUTO_ACCEPT_TOLERANCE * 100).toFixed(0)}%.`
      : `${pct}% from the ${movingMedian.toFixed(2)} moving median — within tolerance.`
  };
}

/**
 * Auto-accept engine.
 *
 * Approves automatically only when BOTH hold:
 *   1. the submission comes from a Trusted Contributor, and
 *   2. the reported price is within ±15% of the historical moving median.
 *
 * Anonymous submissions are never auto-accepted, and a submission whose SKU
 * has no historical series is always left for a human — an unknown component
 * is exactly the case a moderator should look at.
 */
export function evaluateAutoAccept(
  submission: PriceSubmission,
  components: HardwareComponent[]
): AutoAcceptDecision {
  if (submission.contributorTier !== "trusted") {
    return { accept: false, movingMedian: null, deviation: null, reason: "Contributor is not a Trusted Contributor — manual review required." };
  }

  const component = components.find((c) => c.sku === submission.sku);
  if (!component || component.historicalPrices.length === 0) {
    return { accept: false, movingMedian: null, deviation: null, reason: "No historical price series for this SKU — manual review required." };
  }

  const movingMedian = median(component.historicalPrices.map(([, price]) => price));
  if (movingMedian === null || movingMedian <= 0) {
    return { accept: false, movingMedian, deviation: null, reason: "Historical median unavailable — manual review required." };
  }

  const deviation = (submission.reportedPrice - movingMedian) / movingMedian;
  const withinTolerance = Math.abs(deviation) <= AUTO_ACCEPT_TOLERANCE;
  const pct = (deviation * 100).toFixed(1);

  return {
    accept: withinTolerance,
    movingMedian,
    deviation,
    reason: withinTolerance
      ? `Trusted Contributor and ${pct}% from the ${movingMedian.toFixed(2)} moving median (within ±15%).`
      : `Trusted Contributor but ${pct}% from the ${movingMedian.toFixed(2)} moving median (outside ±15%) — manual review required.`
  };
}
