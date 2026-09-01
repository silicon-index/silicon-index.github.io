/*
 * Client-side demo auth for Silicon Index.
 * DEMO ONLY: users, sessions, and contributions all live in this browser's
 * localStorage. There is no server, so this provides zero real security —
 * it exists to preview the Phase 3/4 UX ahead of the real backend-api
 * (see dev-index.md Phase 5). Do not reuse real passwords here.
 */
(function (global) {
  "use strict";

  var USERS_KEY = "si_users";
  var SESSION_KEY = "si_session";
  var DEMO_ADMIN = { username: "admin", password: "admin123" };

  function readUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function ensureDemoAdmin() {
    var users = readUsers();
    if (!users.some(function (u) { return u.username === DEMO_ADMIN.username; })) {
      hashPassword(DEMO_ADMIN.password).then(function (hash) {
        users = readUsers();
        if (!users.some(function (u) { return u.username === DEMO_ADMIN.username; })) {
          users.push({ username: DEMO_ADMIN.username, passwordHash: hash, role: "admin", createdAt: nowIso() });
          writeUsers(users);
        }
      });
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function hashPassword(password) {
    if (global.crypto && global.crypto.subtle) {
      var data = new TextEncoder().encode(password);
      return global.crypto.subtle.digest("SHA-256", data).then(function (buf) {
        return Array.prototype.map
          .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); })
          .join("");
      });
    }
    return Promise.resolve("plain:" + password);
  }

  function register(username, password) {
    username = String(username || "").trim();
    return hashPassword(password).then(function (hash) {
      var users = readUsers();
      if (!username || password.length < 6) {
        return { ok: false, error: "Username required and password must be at least 6 characters." };
      }
      if (users.some(function (u) { return u.username.toLowerCase() === username.toLowerCase(); })) {
        return { ok: false, error: "That username is already taken." };
      }
      users.push({ username: username, passwordHash: hash, role: "contributor", createdAt: nowIso() });
      writeUsers(users);
      return { ok: true };
    });
  }

  function login(username, password) {
    username = String(username || "").trim();
    return hashPassword(password).then(function (hash) {
      var users = readUsers();
      var user = users.find(function (u) { return u.username.toLowerCase() === username.toLowerCase(); });
      if (!user || user.passwordHash !== hash) {
        return { ok: false, error: "Invalid username or password." };
      }
      var session = { username: user.username, role: user.role, loginAt: nowIso() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return { ok: true, session: session };
    });
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (e) {
      return null;
    }
  }

  ensureDemoAdmin();

  global.SiAuth = {
    register: register,
    login: login,
    logout: logout,
    getSession: getSession,
    DEMO_ADMIN_USERNAME: DEMO_ADMIN.username,
    DEMO_ADMIN_PASSWORD: DEMO_ADMIN.password
  };
})(window);
