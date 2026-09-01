/**
 * Market Database — record validation.
 *
 * Implements the constraints declared in `./contracts.ts`. Pure functions, no
 * runtime dependencies, so this runs identically in the browser, in a
 * container, and on the edge.
 */

import {
  HARDWARE_CONSTRAINTS,
  type HardwareComponent,
  type ValidationIssue,
  type ValidationResult
} from "./contracts";

function typeOf(value: unknown): "string" | "number" | "array" | "object" | "other" {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (value !== null && typeof value === "object") return "object";
  return "other";
}

/**
 * Validates a candidate hardware record against `HARDWARE_CONSTRAINTS`.
 * Collects every issue rather than failing on the first, so a submitter sees
 * all problems at once.
 */
export function validateHardwareComponent(candidate: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { valid: false, issues: [{ field: "<root>", message: "Expected a hardware record object." }] };
  }

  const record = candidate as Record<string, unknown>;

  for (const constraint of HARDWARE_CONSTRAINTS) {
    const value = record[constraint.field];

    if (value === null && constraint.nullable) continue;
    if (value === undefined || value === null) {
      if (constraint.required) issues.push({ field: constraint.field, message: "Field is required." });
      continue;
    }

    const actual = typeOf(value);
    if (actual !== constraint.type) {
      issues.push({ field: constraint.field, message: `Expected ${constraint.type}, received ${actual}.` });
      continue;
    }

    if (constraint.type === "number") {
      const numeric = value as number;
      if (!Number.isFinite(numeric)) {
        issues.push({ field: constraint.field, message: "Must be a finite number." });
      } else if (constraint.min !== undefined && numeric < constraint.min) {
        issues.push({ field: constraint.field, message: `Must be >= ${constraint.min}.` });
      }
    }

    if (constraint.type === "string") {
      const text = value as string;
      if (text.trim() === "") {
        issues.push({ field: constraint.field, message: "Must not be empty." });
      } else if (constraint.oneOf && !constraint.oneOf.includes(text)) {
        issues.push({ field: constraint.field, message: `Must be one of: ${constraint.oneOf.join(", ")}.` });
      }
    }
  }

  // Series entries must be [timestamp, price] pairs of finite numbers —
  // a malformed pair renders a silently wrong chart rather than an error.
  const series = record.historicalPrices;
  if (Array.isArray(series)) {
    series.forEach((point, index) => {
      const pair = point as unknown[];
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((n) => typeof n === "number" && Number.isFinite(n))) {
        issues.push({
          field: `historicalPrices[${index}]`,
          message: "Expected a [timestamp, price] pair of finite numbers."
        });
      }
    });
  }

  return { valid: issues.length === 0, issues };
}

/** Narrowing helper for callers that only need a boolean. */
export function isValidHardwareComponent(candidate: unknown): candidate is HardwareComponent {
  return validateHardwareComponent(candidate).valid;
}
