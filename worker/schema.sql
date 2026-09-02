-- Accounts. Two roles share this table:
--   'user'  - public accounts, created via POST /api/register (self-service).
--   'admin' - moderators, who can list/approve/reject submissions. Never created via
--             the public register endpoint - seed with scripts/hash-password.mjs
--             (see worker/README.md) and an explicit INSERT.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL, -- format: pbkdf2$<iterations>$<saltB64url>$<hashB64url>
  role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  created_at INTEGER NOT NULL
);

-- Ephemeral, database-backed sessions. See worker/src/session.js for the selector/
-- validator split-token design and why only a MAC (never the validator) is stored here.
CREATE TABLE IF NOT EXISTS sessions (
  selector TEXT PRIMARY KEY,
  validator_mac TEXT NOT NULL,
  nonce TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- Community price submissions awaiting moderation.
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id TEXT NOT NULL,
  price_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  submitted_by TEXT, -- free-text display name, kept for anonymous submissions
  account_id INTEGER REFERENCES users(id), -- set when submitted by a signed-in account
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at INTEGER NOT NULL,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status);
