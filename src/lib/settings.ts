import type { SiteSettings } from "./types";

/*
 * Client-side demo admin settings for Silicon Index.
 * Stores editable pointer config (which repo/branch backs the Market
 * Database, Contributors, and Donations ecosystem links, which external
 * payment links the Support panel shows, and any admin overrides for the
 * ecosystem navigation routes) in localStorage under si_settings. This is
 * config only — no payment is ever processed on this static site, it only
 * links out to whatever processor the admin configures. Because there is no
 * backend, a change here only takes effect in the browser that saved it —
 * see dev-index.md Phase 9.5.
 */

const STORE_KEY = "si_settings";

export const DEFAULTS: SiteSettings = {
  marketDbUrl: "https://github.com/silicon-index/silicon-index-market-database.github.io/tree/dev",
  contributorsUrl: "https://github.com/silicon-index/silicon-index-contributors.github.io/tree/dev",
  donationsApiUrl: "https://github.com/silicon-index/silicon-index-donations-api.github.io/tree/dev",
  githubSponsorsUrl: "",
  paypalUrl: "",
  customDonationLabel: "",
  customDonationUrl: "",
  navOverrides: {},
  navPagesDeployed: {}
};

const STRING_FIELDS = [
  "marketDbUrl",
  "contributorsUrl",
  "donationsApiUrl",
  "githubSponsorsUrl",
  "paypalUrl",
  "customDonationLabel",
  "customDonationUrl"
] as const;

type StringField = (typeof STRING_FIELDS)[number];

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  });
  return out;
}

function asBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, boolean> = {};
  Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
    if (typeof v === "boolean") out[k] = v;
  });
  return out;
}

export function get(): SiteSettings {
  let stored: Partial<SiteSettings> = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    stored = {};
  }

  const result = { ...DEFAULTS, navOverrides: {}, navPagesDeployed: {} } as SiteSettings;
  STRING_FIELDS.forEach((key) => {
    const value = stored[key];
    result[key] = typeof value === "string" ? value : DEFAULTS[key];
  });
  result.navOverrides = asStringMap(stored.navOverrides);
  result.navPagesDeployed = asBooleanMap(stored.navPagesDeployed);
  return result;
}

export function set(partial: Partial<SiteSettings>): SiteSettings {
  const current = get();
  const next = { ...current } as SiteSettings;

  STRING_FIELDS.forEach((key: StringField) => {
    const value = partial[key];
    if (typeof value === "string") next[key] = value.trim();
  });

  if (partial.navOverrides) next.navOverrides = asStringMap(partial.navOverrides);
  if (partial.navPagesDeployed) next.navPagesDeployed = asBooleanMap(partial.navPagesDeployed);

  localStorage.setItem(STORE_KEY, JSON.stringify(next));
  return next;
}

export function reset(): SiteSettings {
  localStorage.removeItem(STORE_KEY);
  return { ...DEFAULTS, navOverrides: {}, navPagesDeployed: {} };
}
