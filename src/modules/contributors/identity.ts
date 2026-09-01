// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pseudonymous identity for signed-out contributors.
 *
 * A persistent random identifier held in `localStorage`, deliberately *not* an
 * IP address or device fingerprint: this static site has no server to read a
 * real client IP from, and capturing one client-side would leak it to a third
 * party and break the "no PII" whitelist rule in DEV-GUIDE.md §2.
 *
 * WHAT THIS IS AND IS NOT
 *   It is a stable reputation key: the same browser keeps the same hash, so
 *   approved submissions accumulate into a trust score without an account.
 *   It is NOT anonymity in the strong sense — a persistent identifier links
 *   every submission from this browser to each other, forever. That linkage is
 *   the whole point of reputation, but it means the value should be treated as
 *   a pseudonym, not as untraceable. It is disclosed to the contributor on the
 *   contribute page rather than attached invisibly.
 *
 * Clearing site data resets it, which resets the reputation with it.
 */

/** Full stable identifier — the reputation key. */
const CONTRIBUTOR_HASH_KEY = "silicon_anon_id";

/** Pre-UUID key. Read for continuity so existing reputation is not orphaned. */
const LEGACY_HANDLE_KEY = "si_anon_id";

/**
 * Cryptographically random UUID.
 *
 * `crypto.randomUUID()` needs a secure context: it is undefined over plain
 * HTTP on anything but localhost, so a LAN-IP dev server would throw. The
 * fallback builds a v4 UUID from `getRandomValues`, and only if neither exists
 * does this fall back to `Math.random`, which is not cryptographically random
 * and must never be the primary path — collisions there would merge two
 * contributors' reputations.
 */
function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  const rand = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${rand()}${rand()}-${rand()}-4${rand().slice(1)}-a${rand().slice(1)}-${rand()}${rand()}${rand()}`;
}

/**
 * Returns this browser's persistent contributor hash, creating it on first use.
 * This is the value that accrues reputation across sessions.
 */
export function getOrCreateContributorHash(): string {
  let hash = localStorage.getItem(CONTRIBUTOR_HASH_KEY);
  if (!hash) {
    hash = randomUuid();
    localStorage.setItem(CONTRIBUTOR_HASH_KEY, hash);
  }
  return hash;
}

/**
 * Short readable handle shown in the UI and stored as `contributorId`.
 *
 * Derived from the hash so it is stable, but the full hash remains the key —
 * two contributors could in principle share a truncated handle, and reputation
 * must not merge because of a display collision.
 */
export function deriveHandle(hash: string): string {
  return "anon-" + hash.replace(/-/g, "").slice(0, 8);
}

/**
 * The contributor's display handle.
 *
 * A pre-existing `si_anon_id` is preserved as the handle so submissions made
 * before the UUID change keep grouping with new ones from the same browser;
 * without that, upgrading would silently orphan someone's reputation.
 */
export function getOrCreateAnonymousId(): string {
  const legacy = localStorage.getItem(LEGACY_HANDLE_KEY);
  if (legacy) return legacy;
  return deriveHandle(getOrCreateContributorHash());
}
