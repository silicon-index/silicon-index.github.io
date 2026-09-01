// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Security Portal — advisory and incident reporting contracts.
 *
 * Pure types, no runtime imports. **Layer-0 contract.**
 *
 * Mirrors `silicon-index-security.github.io`. Note the privacy constraint that
 * runs through these shapes: a reporter is identified by a handle or is
 * anonymous, never by email, IP, or any other personal identifier. Disclosure
 * correspondence happens outside this schema.
 */

/** CVSS-aligned qualitative severity. */
export type AdvisorySeverity = "none" | "low" | "medium" | "high" | "critical";

export type AdvisoryStatus = "draft" | "published" | "resolved" | "withdrawn";

/** Which ecosystem repo an advisory concerns. */
export interface AffectedModule {
  /** Nav id from `src/config/navigation.ts`, e.g. `database`, `scrapers`. */
  moduleId: string;
  repository: string;
  /** Affected version range or branch; `null` when not yet determined. */
  affectedRange: string | null;
  fixedIn: string | null;
}

/**
 * A published security advisory.
 * `advisoryId` follows `SI-YYYY-NNN`.
 */
export interface AdvisoryPayload {
  advisoryId: string;
  title: string;
  summary: string;
  severity: AdvisorySeverity;
  /** CVSS v3.1 base score, 0.0–10.0, when one has been calculated. */
  cvssScore: number | null;
  status: AdvisoryStatus;
  affected: AffectedModule[];
  publishedAt: string | null;
  updatedAt: string | null;
  /** Credited reporter handle, or null when they asked to stay anonymous. */
  credit: string | null;
  /** External references (CVE, commit, upstream issue). No tracking params. */
  references: string[];
}

/* ------------------------------------------------------------------ */
/* Incident reporting                                                  */
/* ------------------------------------------------------------------ */

export type IncidentCategory =
  | "data_integrity"
  | "scraper_abuse"
  | "credential_exposure"
  | "availability"
  | "privacy"
  | "other";

export type IncidentStatus = "reported" | "triaged" | "mitigated" | "closed";

/**
 * An inbound vulnerability or incident report.
 *
 * `reporterHandle` is a pseudonymous handle or null. Deliberately no email,
 * IP, or location field: the portal is static and must not collect PII
 * (DEV-GUIDE.md §1 and §2). Contact for coordinated disclosure is arranged
 * out of band via the Security Portal's stated channel.
 */
export interface IncidentReport {
  incidentId: string;
  category: IncidentCategory;
  severity: AdvisorySeverity;
  status: IncidentStatus;
  /** What was observed. Structured summary, not raw logs or dumps. */
  summary: string;
  affectedModuleIds: string[];
  reportedAt: string;
  triagedAt: string | null;
  resolvedAt: string | null;
  reporterHandle: string | null;
  /** Set once an advisory is published for this incident. */
  linkedAdvisoryId: string | null;
}

/** Disclosure policy the portal states publicly. */
export interface DisclosurePolicy {
  /** Days a reporter is asked to wait before public disclosure. */
  embargoDays: number;
  /** Where reports are accepted (e.g. a GitHub Security Advisory link). */
  channel: string;
  acknowledgesReporters: boolean;
}
