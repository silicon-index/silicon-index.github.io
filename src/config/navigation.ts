// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SiteSettings } from "../lib/types";

/**
 * Single source of truth for every external ecosystem route.
 *
 * Consumed by the header dropdown, the footer link row, the homepage quick
 * links, and the Admin Panel's navigation editor.
 */
export interface NavModule {
  /** Stable key, also used for admin overrides in `SiteSettings.navOverrides`. */
  id: string;
  title: string;
  description: string;
  /** Primary target: the module's `dev` branch (or its Pages site once live). */
  remoteDevUrl: string;
  /**
   * Repo-relative path of this module's local stub docs/contracts inside THIS
   * repository (`src/modules/<id>/`). Documentation pointer only — it is not a
   * served URL, so it is never used as a link href. The href fallback is
   * `fallbackHref` below.
   */
  localStubPath: string;
  badge?: string;
  isExternal: boolean;
  /**
   * Href used when `remoteDevUrl` is known to be unreachable.
   *
   * Verified via the GitHub API: every sibling repo in the org has
   * `has_pages: false` and holds only a stub README/LICENSE, so the two
   * `silicon-index.github.io/<repo>` Pages URLs below 404 today. While
   * `pagesDeployed` is false, visitors are routed here instead and the link is
   * tagged "dev fallback". An admin flips the flag from the Admin Panel once
   * that Pages site is actually published.
   */
  fallbackHref?: string;
  pagesDeployed?: boolean;
  /**
   * For modules that describe the same target as an existing data-source
   * setting, so the Admin Panel edits one value instead of two that can drift.
   */
  settingsKey?: "contributorsUrl" | "marketDbUrl";
}

export const ECOSYSTEM_MODULES: Record<string, NavModule> = {
  contributors: {
    id: "contributors",
    title: "Contributors Hub",
    description: "Guidelines, submission templates, and verification tiers",
    remoteDevUrl: "https://github.com/silicon-index/silicon-index-contributors.github.io/tree/dev",
    localStubPath: "src/modules/contributors",
    badge: "dev",
    isExternal: true,
    settingsKey: "contributorsUrl"
  },
  database: {
    id: "database",
    title: "Database Schemas",
    description: "MongoDB schemas, hardware validation models, and PITR recovery",
    remoteDevUrl: "https://github.com/silicon-index/silicon-index-market-database.github.io/tree/dev",
    localStubPath: "src/modules/database",
    badge: "dev",
    isExternal: true,
    settingsKey: "marketDbUrl"
  },
  scrapers: {
    id: "scrapers",
    title: "Market Scrapers",
    description: "Automated aggregation workers with whitelist sanitization",
    remoteDevUrl: "https://github.com/silicon-index/silicon-index-market-scrapers.github.io/tree/dev",
    localStubPath: "src/modules/scrapers",
    badge: "workers",
    isExternal: true
  },
  ai: {
    id: "ai",
    title: "AI Models",
    description: "Mathematical anomaly detection and fair-value scoring engine",
    remoteDevUrl: "https://github.com/silicon-index/silicon-index-ai.github.io/tree/dev",
    localStubPath: "src/modules/ai",
    badge: "engine",
    isExternal: true
  },
  security: {
    id: "security",
    title: "Security Portal",
    description: "Governance, incident advisories, and disclosure policies",
    remoteDevUrl: "https://silicon-index.github.io/silicon-index-security.github.io",
    localStubPath: "src/modules/security",
    isExternal: true,
    fallbackHref: "https://github.com/silicon-index/silicon-index-security.github.io/tree/dev",
    pagesDeployed: false
  },
  admin: {
    id: "admin",
    title: "Admin Dashboard",
    description: "Moderation console for hardware submission approval and review",
    remoteDevUrl: "https://silicon-index.github.io/silicon-index-admin-dashboard.github.io",
    localStubPath: "src/modules/admin",
    isExternal: true,
    // This portal ships its own working moderation console, so the local route
    // is a genuinely useful fallback rather than a dead end.
    fallbackHref: "/admin",
    pagesDeployed: false
  }
};

/** Ordered list for rendering. */
export function getModuleNavList(): NavModule[] {
  return Object.values(ECOSYSTEM_MODULES);
}

/** Back-compat alias used across the nav components. */
export const DEV_ECOSYSTEM_NAV: NavModule[] = getModuleNavList();

export function getNavItem(id: string): NavModule | undefined {
  return ECOSYSTEM_MODULES[id];
}

/**
 * Build-time resolution: honours the static fallback contract only.
 * `preferFallback` forces the fallback href even when Pages is marked live.
 */
export function resolveModuleHref(moduleId: string, preferFallback = false): string {
  const mod = ECOSYSTEM_MODULES[moduleId];
  if (!mod) return "#";
  if (mod.fallbackHref && (preferFallback || mod.pagesDeployed === false)) return mod.fallbackHref;
  return mod.remoteDevUrl;
}

export function resolveNavHref(item: NavModule): string {
  return resolveModuleHref(item.id);
}

export function isFallingBack(item: NavModule): boolean {
  return !!item.fallbackHref && resolveNavHref(item) === item.fallbackHref;
}

/**
 * Runtime resolution, applied client-side once admin settings are readable.
 * Precedence: explicit admin override → linked data-source setting →
 * admin-toggled Pages-deployed flag → static fallback contract.
 */
export function resolveNavHrefWithSettings(item: NavModule, settings: SiteSettings): string {
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

  return item.remoteDevUrl;
}

export function isFallingBackWithSettings(item: NavModule, settings: SiteSettings): boolean {
  return !!item.fallbackHref && resolveNavHrefWithSettings(item, settings) === item.fallbackHref;
}
