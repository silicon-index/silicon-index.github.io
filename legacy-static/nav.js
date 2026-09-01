/* Renders the session-aware auth chip in the site nav (see auth.js). */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var slot = document.getElementById("nav-auth-slot");
    if (!slot || !window.SiAuth) return;

    var session = window.SiAuth.getSession();

    if (session) {
      var adminLink = session.role === "admin"
        ? '<a class="nav-link" href="admin.html">Admin</a>'
        : "";
      slot.innerHTML =
        adminLink +
        '<span class="nav-user">' + escapeHtml(session.username) +
        '<span class="nav-role-badge">' + escapeHtml(session.role) + "</span></span>" +
        '<button type="button" class="nav-link nav-link--btn" id="nav-sign-out">Sign out</button>';

      document.getElementById("nav-sign-out").addEventListener("click", function () {
        window.SiAuth.logout();
        window.location.href = "index.html";
      });
    } else {
      slot.innerHTML = '<a class="nav-link" href="login.html">Sign in / Register</a>';
    }
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
