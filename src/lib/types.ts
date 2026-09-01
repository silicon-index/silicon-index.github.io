/* Submission and contributor models now live in src/services/dataService.ts
   (PriceSubmission / ContributorProfile) — the canonical data layer. */

export interface PricePoint {
  month: string;
  price: number;
}

export interface ComponentEntry {
  id: string;
  name: string;
  category: string;
  socket: string;
  generation: string;
  releaseYear: number;
  tdpWatts: number;
  /** Launch MSRP. */
  msrp: number;
  fairValueScore: number;
  marketPrice: number;
  currency: string;
  priceHistory: PricePoint[];
}

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
