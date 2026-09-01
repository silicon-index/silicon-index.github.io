// SPDX-License-Identifier: AGPL-3.0-or-later
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
import type { ContributorProfile, NewSubmissionInput, PriceSubmission } from "@modules/contributors/contracts";
import { CATEGORY_ALIASES } from "@modules/database/contracts";
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

/**
 * Base URL of the deployed `database` module API (see `deploy/database/`).
 * Set `PUBLIC_API_URL` at build time to activate it; unset, the portal skips
 * straight to the raw upstream. Astro inlines `PUBLIC_*` vars into the client
 * bundle, so this must never hold a secret.
 */
const API_BASE_URL = (import.meta.env.PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");

/**
 * Where the rendered data actually came from. Distinguished so the UI can be
 * honest about provenance rather than implying every fetch is live.
 */
export type DataOrigin = "api" | "remote" | "fallback";

export interface ServiceResult<T> {
  data: T;
  origin: DataOrigin;
  /** Why an earlier tier was skipped; surfaced in the source badge tooltip. */
  reason?: string;
}

/** Normalizes any accepted payload shape into `HardwareComponent[]`. */
function toComponents(payload: unknown): HardwareComponent[] {
  // The module API wraps its list: `{ count, components }`.
  const list =
    payload && typeof payload === "object" && !Array.isArray(payload) && "components" in payload
      ? (payload as { components: unknown }).components
      : payload;

  if (!Array.isArray(list)) throw new Error("Payload is not an array of components");
  // Upstream may publish either the normalized or the raw shape.
  return isHardwareComponentArray(list) ? list : (list as ComponentEntry[]).map(toHardwareComponent);
}

/* ------------------------------------------------------------------ */
/* Service methods                                                     */
/* ------------------------------------------------------------------ */

/**
 * Market data with a three-tier fallback:
 *
 *   1. the deployed `database` module API   (`PUBLIC_API_URL`, when configured)
 *   2. the market-database repo's raw `dev` branch
 *   3. the bundled local dataset
 *
 * Each tier falls through on network error, offline, or any non-2xx (404/403
 * included), so the screener renders regardless of what is deployed. The
 * reason a tier was skipped is carried through for the source badge.
 */
export async function fetchMarketData(): Promise<ServiceResult<HardwareComponent[]>> {
  const skipped: string[] = [];

  if (API_BASE_URL) {
    try {
      const res = await fetch(`${API_BASE_URL}/components`, {
        cache: "no-store",
        headers: { accept: "application/json" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { data: toComponents(await res.json()), origin: "api" };
    } catch (err) {
      skipped.push(`api: ${(err as Error).message}`);
    }
  }

  try {
    const res = await fetch(MARKET_DATA_RAW_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      data: toComponents(await res.json()),
      origin: "remote",
      reason: skipped.length ? skipped.join("; ") : undefined
    };
  } catch (err) {
    skipped.push(`upstream: ${(err as Error).message}`);
  }

  const res = await fetch(LOCAL_MARKET_DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Local fallback failed (HTTP ${res.status})`);
  return { data: toComponents(await res.json()), origin: "fallback", reason: skipped.join("; ") };
}

/**
 * Active contributor registry. Falls back to the registry derived locally
 * from admin-approved submissions when the remote repo has nothing published.
 */
export async function fetchContributors(): Promise<ServiceResult<ContributorProfile[]>> {
  // No API tier here on purpose: `PUBLIC_API_URL` points at the *database*
  // module, which serves components, not contributors. Adding a speculative
  // `/contributors` call would 404 on every page load. When the contributors
  // module gains a deployed API, give it its own base URL and add a tier.
  try {
    const res = await fetch(CONTRIBUTORS_RAW_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { data: (await res.json()) as ContributorProfile[], origin: "remote" };
  } catch (err) {
    return { data: buildContributorRegistry(readStaged()), origin: "fallback", reason: (err as Error).message };
  }
}

/** Stages a new submission locally for review. Returns the stored record. */
export function stageSubmission(entry: NewSubmissionInput): PriceSubmission {
  // Object.assign keeps the union member intact; a spread literal would widen
  // `category` to `string` and detach it from `specs`.
  const submission: PriceSubmission = Object.assign({}, entry, {
    submissionId: "sub_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
    status: "pending" as const,
    submittedAt: new Date().toISOString()
  });
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
    if (!Array.isArray(raw)) return [];
    const migrated = raw.map(migrateLegacySubmission);
    const dropped = migrated.filter((s) => s === null).length;
    // Never drop silently: a legacy record with an unmappable category is
    // reported so it can be investigated rather than quietly disappearing.
    if (dropped > 0) console.warn(`[dataService] ${dropped} staged submission(s) could not be migrated and were skipped.`);
    return migrated.filter((s): s is PriceSubmission => s !== null);
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
function migrateLegacySubmission(raw: Record<string, unknown>): PriceSubmission | null {
  if (raw.submissionId && raw.reportedPrice !== undefined && raw.specs !== undefined) {
    return raw as unknown as PriceSubmission;
  }

  // Legacy records carried a free-text category and flat socket/generation
  // fields. Map what can be mapped; a record whose category has no canonical
  // form cannot become a valid union member, and inventing one would file the
  // part under a category the contributor never chose.
  const category = CATEGORY_ALIASES[String(raw.category ?? "").trim().toLowerCase()];
  if (!category) return null;

  const legacyStatus = String(raw.status ?? "pending");
  const status = (legacyStatus === "rejected"
    ? "denied"
    : ["pending", "approved", "denied", "flagged"].includes(legacyStatus)
      ? legacyStatus
      : "pending") as PriceSubmission["status"];

  const contributorId = String(raw.contributorId ?? raw.contributor ?? "anon-legacy");

  const base = {
    submissionId: String(raw.id ?? raw.submissionId ?? "sub_migrated_" + Math.random().toString(36).slice(2, 10)),
    // Pre-hash records have no UUID. Reusing the old handle as the key keeps a
    // contributor's existing reputation intact instead of resetting it.
    contributorHash: String(raw.contributorHash ?? contributorId),
    sku: String(raw.sku ?? normalizeSku(String(raw.componentName ?? "unknown"), category)),
    componentName: String(raw.componentName ?? "Unknown component"),
    manufacturer: String(raw.manufacturer ?? "Unknown"),
    releaseYear: Number(raw.releaseYear ?? 0),
    reportedPrice: Number(raw.observedPrice ?? raw.reportedPrice ?? 0),
    currency: String(raw.currency ?? "USD"),
    proofUrl: String(raw.proofUrl ?? ""),
    status,
    contributorId,
    contributorTier: (raw.isAnonymous === false ? "trusted" : "anonymous") as PriceSubmission["contributorTier"],
    submittedAt: String(raw.submittedAt ?? new Date().toISOString()),
    reviewedAt: raw.reviewedAt ? String(raw.reviewedAt) : undefined
  };

  const architecture = String(raw.generation ?? "Unknown");
  const socket = String(raw.socket ?? "Unknown");
  const tdp = raw.tdpWatts === null || raw.tdpWatts === undefined ? undefined : Number(raw.tdpWatts);

  switch (category) {
    case "CPU":
      return { ...base, category, specs: { architecture, socket, cores: 0, tdp } };
    case "GPU":
      return { ...base, category, specs: { architecture, vramCapacity: 0, tdp } };
    case "MOBO":
      return { ...base, category, specs: { chipset: architecture, socket, formFactor: "Unknown", memoryType: "Unknown" } };
    case "RAM":
      return { ...base, category, specs: { capacity: 0, memoryType: architecture, speed: 0 } };
    case "STORAGE":
      return { ...base, category, specs: { type: "SATA", capacity: 0 } };
  }
}

