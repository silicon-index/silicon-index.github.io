/**
 * Pseudonymous identity for signed-out contributors.
 *
 * A random per-browser id stored in `localStorage`, deliberately *not* an IP
 * address or any device fingerprint: this static site has no server to read a
 * real client IP from, and capturing one client-side would leak it to a third
 * party and break the "no PII" whitelist rule in DEV-GUIDE.md §2. Real
 * IP-based dedup/trust belongs server-side in `silicon-index-backend-api`
 * (see dev-index.md Phase 5).
 */

const ANON_ID_KEY = "si_anon_id";

export function getOrCreateAnonymousId(): string {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = "anon-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}
