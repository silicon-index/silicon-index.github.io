// Shared fetch helper for every page under /admin/. No token is ever read from or
// written to localStorage/sessionStorage here - `credentials: "include"` sends the
// HttpOnly session cookie automatically, and that cookie is the only place a session
// handle ever lives.
import { API_BASE } from "./config.js";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // No/invalid JSON body - fine for e.g. 204 responses.
  }

  if (!res.ok) {
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  }
  return data;
}
