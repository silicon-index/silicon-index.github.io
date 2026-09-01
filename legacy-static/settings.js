/*
 * Client-side demo admin settings for Silicon Index.
 * Stores editable pointer config (which repo/branch backs the Market
 * Database, Contributors, and Donations ecosystem links, plus which
 * external payment links the "Support" panel shows) in localStorage under
 * si_settings. This is config only — no payment is ever processed on this
 * static site, it only links out to whatever processor the admin configures
 * (GitHub Sponsors, PayPal, or a custom URL). Editable from admin.html;
 * consumed by index.html to render the current links.
 */
(function (global) {
  "use strict";

  var STORE_KEY = "si_settings";

  var DEFAULTS = {
    marketDbUrl: "https://github.com/silicon-index/silicon-index-market-database.github.io/tree/dev",
    contributorsUrl: "https://github.com/silicon-index/silicon-index-contributors.github.io/tree/dev",
    donationsApiUrl: "https://github.com/silicon-index/silicon-index-donations-api.github.io/tree/dev",
    githubSponsorsUrl: "",
    paypalUrl: "",
    customDonationLabel: "",
    customDonationUrl: ""
  };

  var FIELDS = Object.keys(DEFAULTS);

  function get() {
    var stored;
    try {
      stored = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      stored = {};
    }
    var result = {};
    FIELDS.forEach(function (key) {
      result[key] = typeof stored[key] === "string" ? stored[key] : DEFAULTS[key];
    });
    return result;
  }

  function set(partial) {
    var current = get();
    var next = {};
    FIELDS.forEach(function (key) {
      var value = partial[key];
      next[key] = typeof value === "string" ? value.trim() : current[key];
    });
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    return next;
  }

  function reset() {
    localStorage.removeItem(STORE_KEY);
    return Object.assign({}, DEFAULTS);
  }

  global.SiSettings = {
    get: get,
    set: set,
    reset: reset,
    DEFAULTS: DEFAULTS
  };
})(window);
