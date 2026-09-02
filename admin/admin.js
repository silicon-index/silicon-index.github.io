// Admin dashboard. Holds no persistent client-side state - no localStorage/
// sessionStorage, no cached token. On every load we ask the API who we are (via the
// HttpOnly session cookie, sent automatically with credentials: "include") and render
// accordingly: no session -> bounce to login.html; session but not admin -> show the
// access-denied view; admin -> load the moderation queue.
import { apiFetch, ApiError } from "./api.js";

const loadingView = document.getElementById("loading-view");
const deniedView = document.getElementById("denied-view");
const dashboardView = document.getElementById("dashboard-view");
const whoamiEl = document.getElementById("whoami");
const logoutBtn = document.getElementById("logout-btn");
const dashboardError = document.getElementById("dashboard-error");
const dashboardEmpty = document.getElementById("dashboard-empty");
const submissionsTable = document.getElementById("submissions-table");
const submissionsBody = document.getElementById("submissions-body");
const tabs = document.querySelectorAll(".admin-tab");

let currentStatus = "pending";

function showOnly(view) {
  for (const el of [loadingView, deniedView, dashboardView]) el.hidden = el !== view;
}

async function init() {
  let me;
  try {
    me = await apiFetch("/api/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      window.location.href = "login.html";
      return;
    }
    // Network/server error - stay put and show it, rather than bouncing to login.
    showOnly(loadingView);
    loadingView.querySelector("p").textContent =
      (err && err.message) || "Could not verify your session. Please refresh to try again.";
    return;
  }

  whoamiEl.textContent = `${me.username} (${me.role})`;
  whoamiEl.hidden = false;
  logoutBtn.hidden = false;

  if (me.role !== "admin") {
    showOnly(deniedView);
    return;
  }

  showOnly(dashboardView);
  await loadSubmissions();
}

logoutBtn.addEventListener("click", async () => {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } finally {
    window.location.href = "login.html";
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    tabs.forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    currentStatus = tab.dataset.status;
    await loadSubmissions();
  });
});

async function loadSubmissions() {
  dashboardError.hidden = true;
  try {
    const data = await apiFetch(`/api/submissions?status=${encodeURIComponent(currentStatus)}`);
    renderSubmissions(data.submissions || []);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      window.location.href = "login.html";
      return;
    }
    dashboardError.textContent = (err && err.message) || "Failed to load submissions";
    dashboardError.hidden = false;
    submissionsTable.hidden = true;
    dashboardEmpty.hidden = true;
  }
}

function renderSubmissions(rows) {
  submissionsBody.replaceChildren();

  if (!rows.length) {
    submissionsTable.hidden = true;
    dashboardEmpty.hidden = false;
    return;
  }
  dashboardEmpty.hidden = true;
  submissionsTable.hidden = false;

  for (const row of rows) {
    const tr = document.createElement("tr");

    const componentCell = document.createElement("td");
    componentCell.textContent = row.component_id;
    tr.appendChild(componentCell);

    const priceCell = document.createElement("td");
    priceCell.textContent = `${row.price_amount} ${row.currency}`;
    tr.appendChild(priceCell);

    const byCell = document.createElement("td");
    byCell.textContent = row.submitted_by || "anonymous";
    tr.appendChild(byCell);

    const dateCell = document.createElement("td");
    dateCell.textContent = new Date(row.created_at * 1000).toLocaleString();
    tr.appendChild(dateCell);

    const actionsCell = document.createElement("td");
    if (currentStatus === "pending") {
      const actions = document.createElement("div");
      actions.className = "admin-row-actions";

      const approveBtn = document.createElement("button");
      approveBtn.className = "admin-btn admin-btn-approve";
      approveBtn.textContent = "Approve";
      approveBtn.addEventListener("click", () => review(row.id, "approve"));

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "admin-btn admin-btn-reject";
      rejectBtn.textContent = "Reject";
      rejectBtn.addEventListener("click", () => review(row.id, "reject"));

      actions.append(approveBtn, rejectBtn);
      actionsCell.appendChild(actions);
    }
    tr.appendChild(actionsCell);

    submissionsBody.appendChild(tr);
  }
}

async function review(id, decision) {
  dashboardError.hidden = true;
  try {
    await apiFetch(`/api/submissions/${id}/${decision}`, { method: "POST" });
    await loadSubmissions();
  } catch (err) {
    dashboardError.textContent = (err && err.message) || "Action failed";
    dashboardError.hidden = false;
  }
}

init();
