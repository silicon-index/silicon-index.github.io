(function () {
  "use strict";

  var state = {
    all: [],
    search: "",
    category: "",
    socket: "",
    year: "",
    scalpedOnly: false,
    sort: "price-desc"
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els.tableBody = document.getElementById("table-body");
    els.rowCount = document.getElementById("row-count");
    els.emptyState = document.getElementById("empty-state");
    els.search = document.getElementById("filter-search");
    els.category = document.getElementById("filter-category");
    els.socket = document.getElementById("filter-socket");
    els.year = document.getElementById("filter-year");
    els.scalped = document.getElementById("filter-scalped");
    els.sort = document.getElementById("sort-select");
    els.reset = document.getElementById("filter-reset");

    els.communityBody = document.getElementById("community-table-body");
    els.contributorsBody = document.getElementById("contributors-table-body");

    bindEvents();
    loadData();
    renderCommunity();
    renderContributors();
    applyDataSourceLinks();
  }

  function applyDataSourceLinks() {
    if (!window.SiSettings) return;
    var settings = window.SiSettings.get();
    var marketDbCard = document.getElementById("ecosystem-card-market-db");
    var contributorsCard = document.getElementById("ecosystem-card-contributors");
    var contributorsGuidelinesLink = document.getElementById("contributor-guidelines-link");
    var donationsCard = document.getElementById("ecosystem-card-donations");

    if (marketDbCard) marketDbCard.href = settings.marketDbUrl;
    if (contributorsCard) contributorsCard.href = settings.contributorsUrl;
    if (contributorsGuidelinesLink) contributorsGuidelinesLink.href = settings.contributorsUrl;
    if (donationsCard) donationsCard.href = settings.donationsApiUrl;

    renderSupportLinks(settings);
  }

  function renderSupportLinks(settings) {
    var container = document.getElementById("support-links");
    var emptyEl = document.getElementById("support-empty");
    if (!container || !emptyEl) return;

    var options = [
      { key: "githubSponsorsUrl", label: "GitHub Sponsors", url: settings.githubSponsorsUrl, cls: "support-btn--sponsors" },
      { key: "paypalUrl", label: "PayPal", url: settings.paypalUrl, cls: "support-btn--paypal" },
      { key: "customDonationUrl", label: settings.customDonationLabel || "Donate", url: settings.customDonationUrl, cls: "support-btn--custom" }
    ].filter(function (o) { return o.url; });

    Array.prototype.forEach.call(container.querySelectorAll(".support-btn"), function (el) { el.remove(); });

    if (options.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    options.forEach(function (o) {
      var a = document.createElement("a");
      a.className = "support-btn " + o.cls;
      a.href = o.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = o.label;
      container.appendChild(a);
    });
  }

  function renderContributors() {
    if (!els.contributorsBody || !window.SiContributions) return;
    var contributors = window.SiContributions.getContributorsIndex();

    if (contributors.length === 0) {
      els.contributorsBody.innerHTML = '<tr class="table-loading-row"><td colspan="4">No contributors yet — none have passed check-up.</td></tr>';
      return;
    }

    els.contributorsBody.innerHTML = contributors.map(renderContributorRow).join("");
  }

  function renderContributorRow(c) {
    var badgeClass = c.isAnonymous ? "badge-pending" : "badge-fair";
    return (
      "<tr>" +
      '<td><span class="component-name">' + escapeHtml(c.contributor) + "</span></td>" +
      '<td><span class="badge ' + badgeClass + '"><span class="badge-dot"></span>' + escapeHtml(c.trust) + "</span></td>" +
      '<td class="num-cell">' + c.approvedCount + "</td>" +
      "<td><span class=\"spec-year\">" + (c.lastApprovedAt ? new Date(c.lastApprovedAt).toLocaleString() : "—") + "</span></td>" +
      "</tr>"
    );
  }

  function renderCommunity() {
    if (!els.communityBody || !window.SiContributions) return;
    var items = window.SiContributions.getAll().slice().sort(function (a, b) {
      return new Date(b.submittedAt) - new Date(a.submittedAt);
    });

    if (items.length === 0) {
      els.communityBody.innerHTML = '<tr class="table-loading-row"><td colspan="5">No community submissions yet.</td></tr>';
      return;
    }

    els.communityBody.innerHTML = items.map(renderCommunityRow).join("");
  }

  function renderCommunityRow(item) {
    var trustClass = item.status === "approved" ? "badge-fair" : item.status === "rejected" ? "badge-scalper" : "badge-pending";
    return (
      "<tr>" +
      '<td><span class="component-name">' + escapeHtml(item.componentName) + "</span>" +
      '<span class="component-category">' + escapeHtml(item.category) + "</span></td>" +
      '<td><span class="spec-meta">' + escapeHtml(item.socket) + " · " + escapeHtml(item.generation) + "</span></td>" +
      '<td class="num-cell market-price">' + formatPrice(item.observedPrice, item.currency) + "</td>" +
      "<td>" + escapeHtml(item.contributor) + "</td>" +
      '<td><span class="badge ' + trustClass + '"><span class="badge-dot"></span>' + escapeHtml(item.trust) + "</span></td>" +
      "</tr>"
    );
  }

  function bindEvents() {
    els.search.addEventListener("input", function (e) {
      state.search = e.target.value.trim().toLowerCase();
      render();
    });
    els.category.addEventListener("change", function (e) {
      state.category = e.target.value;
      render();
    });
    els.socket.addEventListener("change", function (e) {
      state.socket = e.target.value;
      render();
    });
    els.year.addEventListener("change", function (e) {
      state.year = e.target.value;
      render();
    });
    els.scalped.addEventListener("change", function (e) {
      state.scalpedOnly = e.target.checked;
      render();
    });
    els.sort.addEventListener("change", function (e) {
      state.sort = e.target.value;
      render();
    });
    els.reset.addEventListener("click", resetFilters);
  }

  function resetFilters() {
    state.search = "";
    state.category = "";
    state.socket = "";
    state.year = "";
    state.scalpedOnly = false;
    state.sort = "price-desc";

    els.search.value = "";
    els.category.value = "";
    els.socket.value = "";
    els.year.value = "";
    els.scalped.checked = false;
    els.sort.value = "price-desc";

    render();
  }

  function loadData() {
    fetch("mock-data.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load mock-data.json (" + res.status + ")");
        return res.json();
      })
      .then(function (data) {
        state.all = data;
        populateFilterOptions(data);
        render();
      })
      .catch(function (err) {
        els.tableBody.innerHTML =
          '<tr class="table-loading-row"><td colspan="5">Error loading data: ' +
          escapeHtml(err.message) +
          "</td></tr>";
      });
  }

  function populateFilterOptions(data) {
    var categories = uniqueSorted(data.map(function (d) { return d.category; }));
    var sockets = uniqueSorted(data.map(function (d) { return d.socket; }));
    var years = uniqueSorted(data.map(function (d) { return d.releaseYear; })).sort(function (a, b) { return b - a; });

    fillSelect(els.category, categories);
    fillSelect(els.socket, sockets);
    fillSelect(els.year, years);
  }

  function fillSelect(select, values) {
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  }

  function uniqueSorted(arr) {
    var set = {};
    arr.forEach(function (v) {
      if (v !== null && v !== undefined) set[v] = true;
    });
    return Object.keys(set).sort();
  }

  function isScalped(item) {
    return item.marketPrice > item.fairValueScore;
  }

  function getFiltered() {
    return state.all.filter(function (item) {
      if (state.search && item.name.toLowerCase().indexOf(state.search) === -1) return false;
      if (state.category && item.category !== state.category) return false;
      if (state.socket && item.socket !== state.socket) return false;
      if (state.year && String(item.releaseYear) !== state.year) return false;
      if (state.scalpedOnly && !isScalped(item)) return false;
      return true;
    });
  }

  function getSorted(items) {
    var sorted = items.slice();
    switch (state.sort) {
      case "name-asc":
        sorted.sort(function (a, b) { return a.name.localeCompare(b.name); });
        break;
      case "price-asc":
        sorted.sort(function (a, b) { return a.marketPrice - b.marketPrice; });
        break;
      case "price-desc":
        sorted.sort(function (a, b) { return b.marketPrice - a.marketPrice; });
        break;
      case "fv-desc":
        sorted.sort(function (a, b) { return b.fairValueScore - a.fairValueScore; });
        break;
      case "delta-desc":
        sorted.sort(function (a, b) {
          return (b.marketPrice - b.fairValueScore) - (a.marketPrice - a.fairValueScore);
        });
        break;
    }
    return sorted;
  }

  function render() {
    var filtered = getSorted(getFiltered());

    els.rowCount.textContent = filtered.length + " component" + (filtered.length === 1 ? "" : "s");

    if (filtered.length === 0) {
      els.tableBody.innerHTML = "";
      els.emptyState.hidden = false;
      return;
    }

    els.emptyState.hidden = true;
    els.tableBody.innerHTML = filtered.map(renderRow).join("");
  }

  function renderRow(item) {
    var scalped = isScalped(item);
    var priceClass = scalped ? "price-over" : "price-under";
    var badge = scalped
      ? '<span class="badge badge-scalper"><span class="badge-dot"></span>Scalper Alert</span>'
      : '<span class="badge badge-fair"><span class="badge-dot"></span>Fair Priced</span>';

    return (
      "<tr>" +
      '<td><span class="component-name">' + escapeHtml(item.name) + "</span>" +
      '<span class="component-category">' + escapeHtml(item.category) + "</span></td>" +
      '<td><span class="spec-meta">' + escapeHtml(item.socket) + " · " + escapeHtml(item.generation) + "</span> " +
      '<span class="spec-year">(' + item.releaseYear + ")</span></td>" +
      '<td class="num-cell fair-value">' + formatPrice(item.fairValueScore, item.currency) + "</td>" +
      '<td class="num-cell market-price ' + priceClass + '">' + formatPrice(item.marketPrice, item.currency) + "</td>" +
      "<td>" + badge + "</td>" +
      "</tr>"
    );
  }

  function formatPrice(value, currency) {
    var symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency + " ";
    return symbol + Number(value).toLocaleString();
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
