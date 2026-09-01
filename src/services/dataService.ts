/**
 * Silicon Index — decoupled data service layer.
 *
 * Canonical data contracts and the only place that talks to remote data.
 * Every read attempts the owning repo's raw `dev` branch content first and
 * falls back to the bundled local dataset, so the portal keeps working
 * offline, rate-limited, or (as today) while the sibling repos are empty.
 *
 * Verified via the GitHub API: every sibling repo in the org currently has
 * `has_pages: false` and contains only a stub README/LICENSE. Both raw
 * endpoints below therefore 404 right now and every call resolves from the
 * fallback. No code change is needed here once those repos publish data.
 */

import type { ComponentEntry } from "../lib/types";

/* ------------------------------------------------------------------ */
/* Data models                                                         */
/* ------------------------------------------------------------------ */

/** A single historical observation: `[unix-ms timestamp, price]`. */
export type PricePointTuple = [number, number];

export interface HardwareComponent {
  sku: string;
  name: string;
  category: string;
  /** Manufacturer suggested retail price at launch. */
  msrp: number;
  /** Current median observed market price across tracked sources. */
  medianMarketPrice: number;
  currency: string;
  /** Chronological price series, oldest first. */
  historicalPrices: PricePointTuple[];
  /** Deterministic fair-value index (see sidebar note on the screener). */
  fairValueScore: number;
  socket: string;
  generation: string;
  releaseYear: number;
  tdpWatts: number;
}

export type ContributorTier = "anonymous" | "trusted";

export interface ContributorProfile {
  contributorId: string;
  tier: ContributorTier;
  /** 0–100. Derived from approved vs. denied/flagged submission history. */
  trustScore: number;
  verifiedSubmissions: number;
  lastApprovedAt: string | null;
}

export type SubmissionStatus = "pending" | "approved" | "denied" | "flagged";

export interface PriceSubmission {
  submissionId: string;
  sku: string;
  /** Display name as typed by the contributor; `sku` is the normalized key. */
  componentName: string;
  category: string;
  socket: string;
  generation: string;
  releaseYear: number;
  reportedPrice: number;
  currency: string;
  tdpWatts: number | null;
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
  /** Human-readable trace of the auto-accept decision, for the audit trail. */
  decisionNote?: string;
}

/* ------------------------------------------------------------------ */
/* Remote endpoints + local fallbacks                                  */
/* ------------------------------------------------------------------ */

const MARKET_DATA_RAW_URL =
  "https://raw.githubusercontent.com/silicon-index/silicon-index-market-database.github.io/dev/data/market-data.json";
const CONTRIBUTORS_RAW_URL =
  "https://raw.githubusercontent.com/silicon-index/silicon-index-contributors.github.io/dev/data/contributors.json";

const LOCAL_MARKET_DATA_URL = "/mock-data.json";
const STAGING_KEY = "si_contributions";

export type DataOrigin = "remote" | "fallback";

export interface ServiceResult<T> {
  data: T;
  origin: DataOrigin;
  /** Present when the remote attempt failed; useful for the source badge/tooltip. */
  reason?: string;
}

/* ------------------------------------------------------------------ */
/* Adapters                                                            */
/* ------------------------------------------------------------------ */

function monthToTimestamp(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return Date.UTC(year, (m || 1) - 1, 1);
}

/** Normalizes the local `mock-data.json` shape into `HardwareComponent`. */
export function toHardwareComponent(entry: ComponentEntry): HardwareComponent {
  return {
    sku: entry.id,
    name: entry.name,
    category: entry.category,
    msrp: entry.msrp,
    medianMarketPrice: entry.marketPrice,
    currency: entry.currency,
    historicalPrices: entry.priceHistory.map((p) => [monthToTimestamp(p.month), p.price] as PricePointTuple),
    fairValueScore: entry.fairValueScore,
    socket: entry.socket,
    generation: entry.generation,
    releaseYear: entry.releaseYear,
    tdpWatts: entry.tdpWatts
  };
}

function isHardwareComponentArray(value: unknown): value is HardwareComponent[] {
  return Array.isArray(value) && value.every((v) => v && typeof v === "object" && "sku" in v && "historicalPrices" in v);
}

/* ------------------------------------------------------------------ */
/* Service methods                                                     */
/* ------------------------------------------------------------------ */

/**
 * Live market data with automatic local fallback.
 * Falls back on network error, offline, or any non-2xx (404/403 included).
 */
export async function fetchMarketData(): Promise<ServiceResult<HardwareComponent[]>> {
  try {
    const res = await fetch(MARKET_DATA_RAW_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload: unknown = await res.json();
    // The remote repo may publish either the normalized or the raw shape.
    const data = isHardwareComponentArray(payload)
      ? payload
      : (payload as ComponentEntry[]).map(toHardwareComponent);
    return { data, origin: "remote" };
  } catch (err) {
    const res = await fetch(LOCAL_MARKET_DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Local fallback failed (HTTP ${res.status})`);
    const local = (await res.json()) as ComponentEntry[];
    return { data: local.map(toHardwareComponent), origin: "fallback", reason: (err as Error).message };
  }
}

/**
 * Active contributor registry. Falls back to the registry derived locally
 * from admin-approved submissions when the remote repo has nothing published.
 */
export async function fetchContributors(): Promise<ServiceResult<ContributorProfile[]>> {
  try {
    const res = await fetch(CONTRIBUTORS_RAW_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { data: (await res.json()) as ContributorProfile[], origin: "remote" };
  } catch (err) {
    return { data: buildContributorRegistry(readStaged()), origin: "fallback", reason: (err as Error).message };
  }
}

/** Stages a new submission locally for review. Returns the stored record. */
export function stageSubmission(
  entry: Omit<PriceSubmission, "submissionId" | "status" | "submittedAt">
): PriceSubmission {
  const submission: PriceSubmission = {
    ...entry,
    submissionId: "sub_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
    status: "pending",
    submittedAt: new Date().toISOString()
  };
  const staged = readStaged();
  staged.push(submission);
  writeStaged(staged);
  return submission;
}

/* ------------------------------------------------------------------ */
/* Local staging store                                                 */
/* ------------------------------------------------------------------ */

export function readStaged(): PriceSubmission[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STAGING_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(migrateLegacySubmission) : [];
  } catch {
    return [];
  }
}

export function writeStaged(items: PriceSubmission[]): void {
  localStorage.setItem(STAGING_KEY, JSON.stringify(items));
}

/**
 * Migrates records written by the pre-service demo schema
 * (`observedPrice`/`contributor`/`isAnonymous`, status `rejected`) so existing
 * browsers don't lose their staged submissions on upgrade.
 */
function migrateLegacySubmission(raw: Record<string, unknown>): PriceSubmission {
  if (raw.submissionId && raw.reportedPrice !== undefined) return raw as unknown as PriceSubmission;

  const legacyStatus = String(raw.status ?? "pending");
  const status: SubmissionStatus =
    legacyStatus === "rejected" ? "denied" : (["pending", "approved", "denied", "flagged"].includes(legacyStatus)
      ? (legacyStatus as SubmissionStatus)
      : "pending");

  return {
    submissionId: String(raw.id ?? "sub_migrated_" + Math.random().toString(36).slice(2, 10)),
    sku: String(raw.sku ?? normalizeSku(String(raw.componentName ?? "unknown"), String(raw.category ?? ""))),
    componentName: String(raw.componentName ?? "Unknown component"),
    category: String(raw.category ?? ""),
    socket: String(raw.socket ?? ""),
    generation: String(raw.generation ?? ""),
    releaseYear: Number(raw.releaseYear ?? 0),
    reportedPrice: Number(raw.observedPrice ?? raw.reportedPrice ?? 0),
    currency: String(raw.currency ?? "USD"),
    tdpWatts: raw.tdpWatts === null || raw.tdpWatts === undefined ? null : Number(raw.tdpWatts),
    proofUrl: String(raw.proofUrl ?? ""),
    status,
    contributorId: String(raw.contributorId ?? raw.contributor ?? "anon-legacy"),
    contributorTier: raw.isAnonymous === false ? "trusted" : "anonymous",
    submittedAt: String(raw.submittedAt ?? new Date().toISOString()),
    reviewedAt: raw.reviewedAt ? String(raw.reviewedAt) : undefined
  };
}

/** Normalized `component_id` per DEV-GUIDE.md §2 (e.g. `gpu_rtx_4070_12gb`). */
export function normalizeSku(name: string, category: string): string {
  const slug = `${category} ${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "unknown_component";
}

/* ------------------------------------------------------------------ */
/* Contributor registry                                                */
/* ------------------------------------------------------------------ */

/**
 * Derives contributor profiles from submission history.
 * Trust score = approved / (approved + denied + flagged), scaled to 0–100;
 * a contributor with no reviewed submissions scores 0 rather than 100.
 */
export function buildContributorRegistry(submissions: PriceSubmission[]): ContributorProfile[] {
  const byId = new Map<string, { approved: number; rejected: number; tier: ContributorTier; last: string | null }>();

  submissions.forEach((s) => {
    const current = byId.get(s.contributorId) ?? { approved: 0, rejected: 0, tier: s.contributorTier, last: null };
    if (s.status === "approved") {
      current.approved += 1;
      if (!current.last || new Date(s.reviewedAt ?? 0) > new Date(current.last)) current.last = s.reviewedAt ?? null;
    } else if (s.status === "denied" || s.status === "flagged") {
      current.rejected += 1;
    }
    // A contributor is "trusted" if any submission was made while signed in.
    if (s.contributorTier === "trusted") current.tier = "trusted";
    byId.set(s.contributorId, current);
  });

  return Array.from(byId.entries())
    .map(([contributorId, v]) => {
      const reviewed = v.approved + v.rejected;
      return {
        contributorId,
        tier: v.tier,
        trustScore: reviewed === 0 ? 0 : Math.round((v.approved / reviewed) * 100),
        verifiedSubmissions: v.approved,
        lastApprovedAt: v.last
      };
    })
    .sort((a, b) => b.trustScore - a.trustScore || b.verifiedSubmissions - a.verifiedSubmissions);
}

/* ------------------------------------------------------------------ */
/* Auto-accept engine                                                  */
/* ------------------------------------------------------------------ */

export const AUTO_ACCEPT_TOLERANCE = 0.15;

export interface AutoAcceptDecision {
  accept: boolean;
  /** Median of the component's historical series, or null when unavailable. */
  movingMedian: number | null;
  /** Signed deviation from the median as a ratio (0.08 === +8%). */
  deviation: number | null;
  reason: string;
}

/** Median of a numeric series (mean of the two middle values when even). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

/* ------------------------------------------------------------------ */
/* Contributor-repo submission schema                                  */
/* ------------------------------------------------------------------ */

/**
 * Standardized payload shape consumed by `silicon-index-contributors.github.io`.
 * Deliberately whitelist-only per DEV-GUIDE.md §2: normalized `component_id`,
 * strictly numeric `price_amount`, ISO currency and timestamp, categorical
 * `source_type`. Carries no contributor PII — only the pseudonymous id and tier.
 */
export interface ContributorSchemaPayload {
  schema_version: 1;
  submission_id: string;
  component_id: string;
  price_amount: number;
  currency: string;
  timestamp: string;
  source_type: "retail" | "marketplace_avg" | "refurbished";
  proof_url: string;
  contributor: { id: string; tier: ContributorTier };
  status: SubmissionStatus;
  review: { reviewed_at: string | null; auto_accepted: boolean; note: string | null };
}

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
    contributor: { id: submission.contributorId, tier: submission.contributorTier },
    status: submission.status,
    review: {
      reviewed_at: submission.reviewedAt ?? null,
      auto_accepted: submission.autoAccepted ?? false,
      note: submission.decisionNote ?? submission.denialReason ?? null
    }
  };
}
