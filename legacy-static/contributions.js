/*
 * Client-side demo contribution queue for Silicon Index.
 * Stores submissions in localStorage under si_contributions. Anonymous
 * submissions are allowed per the Phase 3 roadmap; each entry carries a
 * Trust Score (Phase 4) that starts as "Pending Validation" until an admin
 * approves or flags it via admin.html. No PII fields are collected, in
 * line with DEV-GUIDE.md's strict whitelist rule — anonymous contributors
 * get a random per-browser pseudonymous ID (si_anon_id) instead of any
 * real identifier like an IP address, which this static site cannot see
 * server-side anyway.
 */
(function (global) {
  "use strict";

  var STORE_KEY = "si_contributions";
  var ANON_ID_KEY = "si_anon_id";

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function writeAll(items) {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
  }

  function getOrCreateAnonymousId() {
    var id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = "anon-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  }

  function submit(entry) {
    var items = readAll();
    var isAnonymous = !entry.contributor;
    var record = {
      id: "contrib_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      componentName: entry.componentName,
      category: entry.category,
      socket: entry.socket,
      generation: entry.generation,
      releaseYear: entry.releaseYear,
      observedPrice: entry.observedPrice,
      currency: entry.currency,
      tdpWatts: entry.tdpWatts,
      proofUrl: entry.proofUrl,
      contributor: entry.contributor || getOrCreateAnonymousId(),
      isAnonymous: isAnonymous,
      status: "pending",
      trust: "Pending Validation",
      submittedAt: new Date().toISOString()
    };
    items.push(record);
    writeAll(items);
    return record;
  }

  function getAll() {
    return readAll();
  }

  function getApproved() {
    return readAll().filter(function (i) { return i.status === "approved"; });
  }

  function getPending() {
    return readAll().filter(function (i) { return i.status === "pending"; });
  }

  function setStatus(id, status) {
    var items = readAll();
    var item = items.find(function (i) { return i.id === id; });
    if (!item) return null;
    item.status = status;
    if (status === "approved") {
      item.trust = item.isAnonymous ? "Anonymous Contribution" : "Trusted Contributor";
    } else if (status === "rejected") {
      item.trust = "Flagged";
    } else {
      item.trust = "Pending Validation";
    }
    item.reviewedAt = new Date().toISOString();
    writeAll(items);
    return item;
  }

  function getContributorsIndex() {
    var approved = getAll().filter(function (i) { return i.status === "approved"; });
    var byName = {};

    approved.forEach(function (item) {
      var key = item.contributor;

      if (!byName[key]) {
        byName[key] = {
          contributor: key,
          isAnonymous: !!item.isAnonymous,
          trust: item.trust,
          approvedCount: 0,
          lastApprovedAt: null
        };
      }
      byName[key].approvedCount += 1;
      if (!byName[key].lastApprovedAt || new Date(item.reviewedAt) > new Date(byName[key].lastApprovedAt)) {
        byName[key].lastApprovedAt = item.reviewedAt;
      }
    });

    return Object.keys(byName)
      .map(function (k) { return byName[k]; })
      .sort(function (a, b) { return new Date(b.lastApprovedAt) - new Date(a.lastApprovedAt); });
  }

  global.SiContributions = {
    submit: submit,
    getAll: getAll,
    getApproved: getApproved,
    getPending: getPending,
    setStatus: setStatus,
    getContributorsIndex: getContributorsIndex,
    getOrCreateAnonymousId: getOrCreateAnonymousId
  };
})(window);
