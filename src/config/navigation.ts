import type { SiteSettings } from "../lib/types";

export interface NavItem {
  /** Stable key used for admin overrides in `SiteSettings.navOverrides`. */
  id: string;
  title: string;
  href: string;
  isExternal: boolean;
  badge?: string;
  /**
   * Where to point when `href` is known to be unreachable.
   *
   * Verified via the GitHub API: every sibling repo in the org has
   * `has_pages: false` and contains only a stub README/LICENSE. The two
   * `silicon-index.github.io/<repo>` Pages URLs below therefore 404 today.
   * `resolveNavHref()` prefers `fallbackHref` while `pagesDeployed` is false,
   * so no visitor is handed a dead link; an admin can flip the flag per-entry
   * from the Admin Panel once that repo actually publishes its Pages site.
   */
  fallbackHref?: string;
  pagesDeployed?: boolean;
  /**
   * For entries that describe the same target as an existing data-source
   * setting, so the Admin Panel edits one value instead of two that can drift.
   */
  settingsKey?: "contributorsUrl" | "marketDbUrl";
}

export const DEV_ECOSYSTEM_NAV: NavItem[] = [
  {
    id: "contributors-hub",
    title: "Contributors Hub",
    href: "https://github.com/silicon-index/silicon-index-contributors.github.io/tree/dev",
    isExternal: true,
    badge: "dev",
    settingsKey: "contributorsUrl"
  },
  {
    id: "database-schemas",
    title: "Database Schemas",
    href: "https://github.com/silicon-index/silicon-index-market-database.github.io/tree/dev",
    isExternal: true,
    badge: "dev",
    settingsKey: "marketDbUrl"
  },
  {
    id: "market-scrapers",
    title: "Market Scrapers",
    href: "https://github.com/silicon-index/silicon-index-market-scrapers.github.io/tree/dev",
    isExternal: true,
    badge: "workers"
  },
  {
    id: "ai-models",
    title: "AI Models",
    href: "https://github.com/silicon-index/silicon-index-ai.github.io/tree/dev",
    isExternal: true,
    badge: "engine"
  },
  {
    id: "security-portal",
    title: "Security Portal",
    href: "https://silicon-index.github.io/silicon-index-security.github.io",
    isExternal: true,
    fallbackHref: "https://github.com/silicon-index/silicon-index-security.github.io/tree/dev",
    pagesDeployed: false
  },
  {
    id: "admin-dashboard",
    title: "Admin Dashboard",
    href: "https://silicon-index.github.io/silicon-index-admin-dashboard.github.io",
    isExternal: true,
    fallbackHref: "https://github.com/silicon-index/silicon-index-admin-dashboard.github.io/tree/dev",
    pagesDeployed: false
  }
];

export function getNavItem(id: string): NavItem | undefined {
  return DEV_ECOSYSTEM_NAV.find((i) => i.id === id);
}

/** Build-time resolution: honours the static fallback contract only. */
export function resolveNavHref(item: NavItem): string {
  if (item.fallbackHref && item.pagesDeployed === false) return item.fallbackHref;
  return item.href;
}

/** True when the rendered href had to fall back off the item's primary target. */
export function isFallingBack(item: NavItem): boolean {
  return resolveNavHref(item) !== item.href;
}

/**
 * Runtime resolution, applied client-side once admin settings are readable.
 * Precedence: explicit admin override → linked data-source setting →
 * admin-toggled Pages-deployed flag → static fallback contract.
 */
export function resolveNavHrefWithSettings(item: NavItem, settings: SiteSettings): string {
  const override = settings.navOverrides?.[item.id];
  if (override) return override;

  if (item.settingsKey) {
    const linked = settings[item.settingsKey];
    if (linked) return linked;
  }

  if (item.fallbackHref) {
    const deployed = settings.navPagesDeployed?.[item.id] ?? item.pagesDeployed ?? true;
    if (!deployed) return item.fallbackHref;
  }

  return item.href;
}

export function isFallingBackWithSettings(item: NavItem, settings: SiteSettings): boolean {
  return !!item.fallbackHref && resolveNavHrefWithSettings(item, settings) === item.fallbackHref;
}
