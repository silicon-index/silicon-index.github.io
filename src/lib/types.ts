/**
 * App-level types, plus a facade over the module contracts.
 *
 * Domain models are OWNED by their module and re-exported here for
 * convenience. The dependency direction is one-way — `lib/types` imports from
 * `modules/*`, never the reverse — which is what keeps the graph acyclic while
 * letting the app import from a single familiar path.
 *
 * Prefer importing from the owning module (`@modules/database/contracts`,
 * `@modules/contributors/contracts`, …) in new code; these re-exports exist so
 * the boundary is convenient, not so it can be ignored.
 */

export type {
  ComponentEntry,
  FieldConstraint,
  HardwareComponent,
  PricePoint,
  PricePointTuple,
  ValidationIssue,
  ValidationResult
} from "../modules/database/contracts";

export type {
  ContributorProfile,
  ContributorSchemaPayload,
  ContributorSubmission,
  ContributorTier,
  NewSubmissionInput,
  PriceSubmission,
  VerificationCheck,
  VerificationResult
} from "../modules/contributors/contracts";

export type {
  AutoAcceptRuleSpec,
  DenialReason,
  ModerationAction,
  ModerationDecision,
  SubmissionStatus
} from "../modules/admin/contracts";

export type {
  AnomalyDetectionInput,
  AnomalyDetectionOutput,
  AutoAcceptDecision,
  FairValueInput,
  FairValueOutput
} from "../modules/ai/contracts";

export type {
  IngestionPayload,
  SanitizationResult,
  SourceType,
  WhitelistedStore
} from "../modules/scrapers/contracts";

export type { AdvisoryPayload, AdvisorySeverity, IncidentReport } from "../modules/security/contracts";

/* ------------------------------------------------------------------ */
/* App-level types — not owned by any ecosystem module                 */
/* ------------------------------------------------------------------ */

export type UserRole = "admin" | "contributor";

export interface UserRecord {
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

export interface Session {
  username: string;
  role: UserRole;
  loginAt: string;
}

export interface SiteSettings {
  marketDbUrl: string;
  contributorsUrl: string;
  donationsApiUrl: string;
  githubSponsorsUrl: string;
  paypalUrl: string;
  customDonationLabel: string;
  customDonationUrl: string;
  /** Admin-set href overrides for `DEV_ECOSYSTEM_NAV`, keyed by `NavItem.id`. */
  navOverrides: Record<string, string>;
  /** Admin-set "this repo's Pages site is live now" flags, keyed by `NavItem.id`. */
  navPagesDeployed: Record<string, boolean>;
}
