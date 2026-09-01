import type { Session, UserRecord } from "./types";

/*
 * Client-side demo auth for Silicon Index.
 * DEMO ONLY: users and sessions live in this browser's localStorage. There
 * is no server, so this provides zero real security — it previews the
 * Phase 3/4 UX ahead of the real backend-api. Do not reuse real passwords.
 */

const USERS_KEY = "si_users";
const SESSION_KEY = "si_session";
const DEMO_ADMIN = { username: "admin", password: "admin123" };

function readUsers(): UserRecord[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as UserRecord[];
  } catch {
    return [];
  }
}

function writeUsers(users: UserRecord[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(password);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return "plain:" + password;
}

export async function ensureDemoAdmin(): Promise<void> {
  const users = readUsers();
  if (users.some((u) => u.username === DEMO_ADMIN.username)) return;
  const hash = await hashPassword(DEMO_ADMIN.password);
  const fresh = readUsers();
  if (fresh.some((u) => u.username === DEMO_ADMIN.username)) return;
  fresh.push({ username: DEMO_ADMIN.username, passwordHash: hash, role: "admin", createdAt: new Date().toISOString() });
  writeUsers(fresh);
}

export async function register(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const name = username.trim();
  if (!name || password.length < 6) {
    return { ok: false, error: "Username required and password must be at least 6 characters." };
  }
  const users = readUsers();
  if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "That username is already taken." };
  }
  const passwordHash = await hashPassword(password);
  users.push({ username: name, passwordHash, role: "contributor", createdAt: new Date().toISOString() });
  writeUsers(users);
  return { ok: true };
}

export async function login(username: string, password: string): Promise<{ ok: boolean; error?: string; session?: Session }> {
  const name = username.trim();
  const hash = await hashPassword(password);
  const user = readUsers().find((u) => u.username.toLowerCase() === name.toLowerCase());
  if (!user || user.passwordHash !== hash) {
    return { ok: false, error: "Invalid username or password." };
  }
  const session: Session = { username: user.username, role: user.role, loginAt: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function getSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as Session | null;
  } catch {
    return null;
  }
}

export const DEMO_ADMIN_USERNAME = DEMO_ADMIN.username;
export const DEMO_ADMIN_PASSWORD = DEMO_ADMIN.password;
