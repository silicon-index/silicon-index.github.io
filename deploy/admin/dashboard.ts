// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Admin dashboard — server-side HTML rendering.
 *
 * ────────────────────────────────────────────────────────────────────────
 * NO CLIENT JAVASCRIPT, AND NO CREDENTIAL IN THE PAGE.
 *
 * This replaces the old static-site panel, which had no request-time server
 * and so had to ask the operator to paste `ADMIN_API_TOKEN` into a field and
 * hold it in a module-scoped variable for the life of the tab. That design was
 * unstable (a refresh lost the session; a long-lived tab held a live
 * credential in RAM) and it put a tier-2 secret inside a browser at all.
 *
 * Here the token never leaves the server. The page is plain HTML with plain
 * `<form>` posts: nothing to hydrate, no `fetch`, no token in the DOM, and
 * nothing for an XSS bug to read. Every value interpolated below goes through
 * `escapeHtml` — including the API's own error detail, which is echoed back
 * through a redirect.
 * ────────────────────────────────────────────────────────────────────────
 */

import { DENIAL_REASONS } from "../../src/modules/admin/contracts";
import { CATEGORY_LABELS } from "../../src/ui/specDisplay";
import { escapeHtml, formatPrice } from "../../src/ui/format";

/** One pending submission, as `GET /queue` serialises it. */
export interface QueueRow {
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

export interface DashboardView {
  rows: QueueRow[];
  /** Per-process CSRF token, embedded in every mutating form. */
  csrfToken: string;
  /** Outcome of the previous decision, carried across the POST-redirect-GET. */
  notice?: { kind: "ok" | "error"; text: string };
}

/**
 * Rendered in the footer so an operator can confirm at a glance that the panel
 * is the server-side one and not a stale copy of the old static page.
 */
export interface DashboardMeta {
  /** Where the moderation data actually came from. */
  databaseUrl: string;
}

const STYLE = `
  :root { color-scheme: light dark; --bg:#f6f7f9; --panel:#fff; --line:#d8dce3;
          --text:#14171c; --dim:#5c6472; --ok:#0f7b46; --bad:#b3261e; --accent:#1c4fd8; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#12141a; --panel:#1a1d25; --line:#2c313c; --text:#e6e9ef;
            --dim:#98a1b3; --ok:#3ecf8e; --bad:#ff6b6b; --accent:#7aa2ff; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 ui-sans-serif,system-ui,sans-serif; }
  .wrap { max-width:1200px; margin:0 auto; padding:24px 16px 64px; }
  header { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:4px; }
  h1 { font-size:19px; margin:0; }
  .chip { font-size:12px; color:var(--dim); border:1px solid var(--line); border-radius:999px; padding:2px 9px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; margin-top:16px; }
  .notice { border-radius:6px; padding:10px 12px; margin-top:16px; font-size:13px; border:1px solid; }
  .notice.ok { color:var(--ok); border-color:var(--ok); }
  .notice.error { color:var(--bad); border-color:var(--bad); }
  .scroll { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; min-width:900px; }
  th, td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--dim); }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .name { font-weight:600; }
  .meta { font-size:12px; color:var(--dim); }
  .tier { display:inline-block; font-size:11px; border-radius:999px; padding:1px 8px; border:1px solid var(--line); }
  .tier.trusted { color:var(--ok); border-color:var(--ok); }
  form.row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:0; }
  button { font:inherit; font-size:12px; padding:5px 11px; border-radius:5px; border:1px solid var(--line);
           background:transparent; color:var(--text); cursor:pointer; }
  button.approve { color:var(--ok); border-color:var(--ok); }
  button.reject { color:var(--bad); border-color:var(--bad); }
  select { font:inherit; font-size:12px; padding:4px 6px; border-radius:5px;
           border:1px solid var(--line); background:var(--panel); color:var(--text); max-width:210px; }
  a { color:var(--accent); }
  footer { margin-top:28px; font-size:12px; color:var(--dim); }
  .empty { padding:22px 10px; color:var(--dim); }
`;

function formatTimestamp(value: number | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  // UTC, not locale: a server renders this once for whoever is looking, and an
  // ambiguous local time on an audit surface is worse than a verbose one.
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function proofHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid URL";
  }
}

/**
 * Defense in depth: `proofUrl` should already be http(s)-only by the time it
 * reaches here (see contributors/api.ts's submit-time validation), but this
 * is the actual XSS sink — an <a href> on an authenticated admin's page — so
 * it re-checks the scheme itself rather than trusting the caller. A
 * non-http(s) value (e.g. a `javascript:` URI, however it got here) renders
 * as an inert `#` instead of being emitted into the href.
 */
function safeProofHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    // fall through
  }
  return "#";
}

function renderRow(row: QueueRow, csrfToken: string): string {
  const trusted = row.contributorTier === "trusted";
  const reasons = DENIAL_REASONS.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
  const id = escapeHtml(row.submissionId);

  return `<tr>
    <td>
      <div class="name">${escapeHtml(row.contributorId)}</div>
      <div class="meta" title="contributorHash">${escapeHtml(row.contributorHash.replace(/-/g, "").slice(0, 8) || "—")}</div>
      <span class="tier${trusted ? " trusted" : ""}">${trusted ? "Trusted" : "Anonymous"}</span>
    </td>
    <td>${escapeHtml(CATEGORY_LABELS[row.category] ?? String(row.category))}</td>
    <td>
      <div class="name">${escapeHtml(row.componentName)}</div>
      <div class="meta">${escapeHtml(row.sku)}</div>
    </td>
    <td class="num">${escapeHtml(formatPrice(row.reportedPrice, row.currency))}</td>
    <td>
      <a href="${escapeHtml(safeProofHref(row.proofUrl))}" target="_blank" rel="noopener noreferrer nofollow">View</a>
      <div class="meta">${escapeHtml(proofHost(row.proofUrl))}</div>
    </td>
    <td class="meta">${escapeHtml(formatTimestamp(row.submittedAt))}</td>
    <td>
      <form class="row" method="post" action="/decide">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}" />
        <input type="hidden" name="submissionId" value="${id}" />
        <button class="approve" type="submit" name="action" value="approve">Approve</button>
        <button type="submit" name="action" value="flag">Flag</button>
        <select name="reason" aria-label="Denial reason for ${id}">${reasons}</select>
        <button class="reject" type="submit" name="action" value="deny">Reject</button>
      </form>
    </td>
  </tr>`;
}

export function renderDashboard(view: DashboardView, meta: DashboardMeta): string {
  const { rows, csrfToken, notice } = view;
  const count = rows.length;

  const table = count
    ? `<div class="scroll"><table>
        <thead><tr>
          <th>Contributor</th><th>Category</th><th>Component / SKU</th>
          <th class="num">Price</th><th>Proof</th><th>Submitted</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows.map((row) => renderRow(row, csrfToken)).join("")}</tbody>
      </table></div>`
    : `<p class="empty">Queue is empty — nothing is awaiting review.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Moderation Queue — Silicon Index Admin</title>
<style>${STYLE}</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Moderation Queue</h1>
      <span class="chip">${count} awaiting review</span>
      <span class="chip">server-rendered · token held in server environment</span>
    </header>
    <p class="meta">
      Approve promotes the submission into the core index with
      <code>originalMSRP: null</code> — a submission reports an observed price, not a launch MSRP.
      Reject requires a canonical reason.
    </p>
    ${notice ? `<div class="notice ${notice.kind}">${escapeHtml(notice.text)}</div>` : ""}
    <div class="panel">${table}</div>
    <footer>
      staging database: <code>${escapeHtml(meta.databaseUrl)}</code><br />
      This panel is served only on the private admin host. It ships no JavaScript and never
      renders <code>ADMIN_API_TOKEN</code> into the page.
    </footer>
  </div>
</body>
</html>`;
}
