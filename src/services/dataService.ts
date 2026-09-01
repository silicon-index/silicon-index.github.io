/**
 * Silicon Index — decoupled data service layer.
 *
 * Owns TRANSPORT and STORAGE only. Domain logic lives with its module:
 *   - `src/modules/database/adapters.ts`   normalization + `component_id`
 *   - `src/modules/contributors/registry.ts` trust metrics + outbound schema
 *   - `src/modules/ai/engine.ts`           fair-value / auto-accept rules
 *   - `src/modules/admin/moderation.ts`    moderator state transitions
 * Canonical models are owned by each module's `contracts.ts` (pure types, no
 * runtime imports); `src/lib/types.ts` re-exports them as a facade. The
 * dependency direction is one-way, which is what keeps the graph acyclic.
 *
 * Every read attempts the owning repo's raw `dev` branch content first and
 * falls back to the bundled local dataset, so the portal keeps working
 * offline, rate-limited, or (as today) while the sibling repos are empty.
 *
 * Verified via the GitHub API: every sibling repo in the org currently has
 * `has_pages: false` and contains only a stub README/LICENSE. Both raw
 * endpoints below therefore 404 right now and every call resolves from the
 * fallback. Publish `data/*.json` to those repos (see
 * `scripts/sync-modules.sh`) and this starts resolving remotely with no code
 * change here.
 */

import type { ComponentEntry, HardwareComponent } from "@modules/database/contracts";
import type { ContributorProfile, PriceSubmission } from "@modules/contributors/contracts";
import { isHardwareComponentArray, normalizeSku, toHardwareComponent } from "@modules/database/adapters";
import { buildContributorRegistry } from "@modules/contributors/registry";

// Re-exported so consumers can keep importing models from the service facade.
export type { ComponentEntry, HardwareComponent, PricePointTuple } from "@modules/database/contracts";
export type { ContributorProfile, ContributorTier, PriceSubmission } from "@modules/contributors/contracts";
export type { SubmissionStatus } from "@modules/admin/contracts";

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
  const status = (legacyStatus === "rejected"
    ? "denied"
    : ["pending", "approved", "denied", "flagged"].includes(legacyStatus)
      ? legacyStatus
      : "pending") as PriceSubmission["status"];

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
