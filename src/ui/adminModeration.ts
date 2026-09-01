// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Admin moderation dashboard — memory-only client controller.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE CREDENTIAL NEVER LEAVES RAM
 *
 * Putting `ADMIN_API_TOKEN` in the environment cannot work on a static host:
 * there is no request-time server, so anything the page could read would
 * already be inlined into a public JS file, and Astro only exposes `PUBLIC_*`
 * to client code anyway. Prerendering the queue in frontmatter is worse still —
 * it would bake the live moderation queue into a world-readable asset.
 *
 * So the operator supplies the token, and it is held in a module-scoped
 * variable and NOTHING else:
 *
 *   - no `localStorage`, no `sessionStorage`, no IndexedDB, no cookie
 *   - never written to the DOM, never put in a URL, never logged
 *   - the input is cleared the instant it is read
 *   - a refresh or a closed tab destroys the JS context, taking it with it
 *
 * The cost is real and deliberate: refreshing the page means re-entering the
 * token. That is the trade for leaving no credential at rest on the operator's
 * disk, where an XSS bug or a shared machine could later retrieve it.
 *
 * Enforced, not just intended: `scripts/check-architecture.mjs` rule 6 fails
 * the build if a page reads a server secret, and rule 7 fails it if this file
 * touches a persistence API.
 * ────────────────────────────────────────────────────────────────────────
 */

import { DENIAL_REASONS, type ModerationAction } from "@modules/admin/contracts";
import { CATEGORY_LABELS } from "./specDisplay";
import { escapeHtml, formatPrice } from "./format";

/**
 * The credential, in volatile memory only.
 *
 * A module-scoped binding: it exists for the lifetime of this JS context and
 * is unreachable from storage, the DOM, or another page. Reload and it is gone.
 */
let adminToken: string | null = null;

const API_BASE = (import.meta.env.PUBLIC_ADMIN_API_URL ?? "").trim().replace(/\/+$/, "");

interface QueueRow {
  submissionId: string;
  contributorHash: string;
  contributorId: string;
  contributorTier: string;
  category: keyof typeof CATEGORY_LABELS;
  componentName: string;
  sku: string;
  reportedPrice: number;
  currency: string;
  proofUrl: string;
  submittedAt: number | string;
  status: string;
}

/** True while a token is held. The value itself is never handed out. */
export function hasAdminToken(): boolean {
  return adminToken !== null;
}

function setAdminToken(token: string | null): void {
  adminToken = token;
}

async function callApi(path: string, init: RequestInit = {}): Promise<Response> {
  if (!adminToken) throw new Error("No admin token held. Connect again.");
  // Sent as a header, never as a query parameter: a URL would end up in
  // browser history, proxy logs and any Referer sent onward.
  return fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { accept: "application/json", ...(init.headers ?? {}), "x-service-token": adminToken }
  });
}

function hashPreview(hash: string): string {
  return hash ? hash.replace(/-/g, "").slice(0, 8) : "—";
}

function proofHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid URL";
  }
}

function renderRow(row: QueueRow): string {
  const submitted = new Date(row.submittedAt);
  const tier =
    row.contributorTier === "trusted"
      ? '<span class="badge badge-fair"><span class="badge-dot"></span>Trusted</span>'
      : '<span class="badge badge-pending"><span class="badge-dot"></span>Anonymous</span>';

  const reasons = DENIAL_REASONS.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");

  return (
    "<tr>" +
    `<td><span class="component-name">${escapeHtml(row.contributorId)}</span>` +
    `<br><span class="spec-meta" title="contributorHash">${escapeHtml(hashPreview(row.contributorHash))}</span>` +
    `<br>${tier}</td>` +
    `<td><span class="component-category">${escapeHtml(CATEGORY_LABELS[row.category] ?? row.category)}</span></td>` +
    `<td><span class="component-name">${escapeHtml(row.componentName)}</span>` +
    `<br><span class="spec-meta">${escapeHtml(row.sku)}</span></td>` +
    `<td class="num-cell market-price">${formatPrice(row.reportedPrice, row.currency)}</td>` +
    `<td><a href="${escapeHtml(row.proofUrl)}" target="_blank" rel="noopener noreferrer">View</a>` +
    `<br><span class="spec-meta">${escapeHtml(proofHost(row.proofUrl))}</span></td>` +
    `<td><span class="spec-year" title="${escapeHtml(String(row.submittedAt))}">` +
    `${escapeHtml(submitted.toLocaleDateString())}<br>${escapeHtml(submitted.toLocaleTimeString())}</span></td>` +
    `<td>` +
    `<div class="admin-actions" style="margin-bottom:6px;">` +
    `<button type="button" class="btn-approve" data-action="approve" data-id="${escapeHtml(row.submissionId)}">Approve</button>` +
    `<button type="button" class="btn-reject" data-action="flag" data-id="${escapeHtml(row.submissionId)}">Flag</button>` +
    `</div>` +
    `<div class="admin-actions">` +
    `<select class="deny-reason" data-reason-for="${escapeHtml(row.submissionId)}" aria-label="Denial reason">${reasons}</select>` +
    `<button type="button" class="btn-reject" data-action="deny" data-id="${escapeHtml(row.submissionId)}">Reject</button>` +
    `</div></td>` +
    "</tr>"
  );
}

export function initAdminModeration(): void {
  const root = document.getElementById("remote-moderation");
  if (!root) return;

  const connectPanel = document.getElementById("admin-connect") as HTMLElement;
  const queuePanel = document.getElementById("admin-queue-panel") as HTMLElement;
  const tokenInput = document.getElementById("admin-token-input") as HTMLInputElement;
  const connectBtn = document.getElementById("admin-connect-btn") as HTMLButtonElement;
  const disconnectBtn = document.getElementById("admin-disconnect-btn") as HTMLButtonElement;
  const refreshBtn = document.getElementById("admin-refresh-btn") as HTMLButtonElement;
  const body = document.getElementById("remote-queue-body") as HTMLElement;
  const status = document.getElementById("admin-status") as HTMLElement;
  const endpointEl = document.getElementById("admin-endpoint") as HTMLElement;

  if (!API_BASE) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  endpointEl.textContent = API_BASE;

  const say = (message: string, kind: "ok" | "error" = "ok") => {
    status.hidden = false;
    status.textContent = message;
    status.className = kind === "ok" ? "form-success" : "form-error";
  };

  function showConnected(connected: boolean): void {
    connectPanel.hidden = connected;
    queuePanel.hidden = !connected;
  }

  async function loadQueue(): Promise<void> {
    body.innerHTML = '<tr class="table-loading-row"><td colspan="7">Loading queue…</td></tr>';
    try {
      const res = await callApi("/queue");
      if (res.status === 401) {
        setAdminToken(null);
        showConnected(false);
        return say("Token rejected by the admin API. Check the value and try again.", "error");
      }
      if (res.status === 503) {
        return say("The admin API has no ADMIN_API_TOKEN configured, so privileged routes are disabled.", "error");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as { count: number; submissions: QueueRow[] };
      body.innerHTML = data.submissions.length
        ? data.submissions.map(renderRow).join("")
        : '<tr class="table-loading-row"><td colspan="7">Queue is empty.</td></tr>';
      bindActions();
      say(`${data.count} submission${data.count === 1 ? "" : "s"} awaiting review.`);
    } catch (err) {
      body.innerHTML = '<tr class="table-loading-row"><td colspan="7">Could not load the queue.</td></tr>';
      say(`Could not reach the admin API: ${(err as Error).message}`, "error");
    }
  }

  async function decide(submissionId: string, action: ModerationAction, reason?: string): Promise<void> {
    try {
      const res = await callApi("/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId, action, ...(reason ? { reason } : {}) })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        return say(payload?.error?.detail ?? `Action failed (HTTP ${res.status}).`, "error");
      }
      say(
        action === "approve"
          ? `Approved — promoted ${payload?.promotedSku ?? submissionId} into the core index.`
          : `Submission ${submissionId} is now ${payload?.status ?? action}.`
      );
      void loadQueue();
    } catch (err) {
      say(`Action failed: ${(err as Error).message}`, "error");
    }
  }

  function bindActions(): void {
    body.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id as string;
        const action = btn.dataset.action as ModerationAction;
        const reason =
          action === "deny"
            ? body.querySelector<HTMLSelectElement>(`[data-reason-for="${id}"]`)?.value
            : undefined;
        void decide(id, action, reason);
      });
    });
  }

  connectBtn.addEventListener("click", () => {
    const value = tokenInput.value.trim();
    if (!value) return say("Paste your ADMIN_API_TOKEN to connect.", "error");
    setAdminToken(value);
    // Never leave the credential sitting in the DOM.
    tokenInput.value = "";
    showConnected(true);
    void loadQueue();
  });

  disconnectBtn.addEventListener("click", () => {
    setAdminToken(null);
    showConnected(false);
    body.innerHTML = '<tr class="table-loading-row"><td colspan="7">Not connected.</td></tr>';
    say("Disconnected. The token was discarded from memory.");
  });

  refreshBtn.addEventListener("click", () => void loadQueue());

  // Nothing is restored on load: there is nowhere to restore it from. The
  // operator connects once per page view, by design.
  showConnected(false);

  // Belt and braces. The context dies on unload regardless, but dropping the
  // reference explicitly means a bfcache-restored page cannot resume with it.
  addEventListener("pagehide", () => setAdminToken(null));
}
