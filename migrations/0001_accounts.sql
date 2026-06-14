-- Tangent accounts: users, sessions, email login/recovery codes, WebAuthn passkeys,
-- and the synced engagement profile. Client stays the source of truth for the profile;
-- `profiles` is a sync/backup target. The feed engine remains stateless.
--
-- Timestamps are epoch milliseconds (INTEGER). Opaque ids are random base64url/uuid
-- strings generated in the Worker (crypto.randomUUID / getRandomValues).

-- One row per account. Email is the recoverable anchor; passkeys hang off it.
CREATE TABLE users (
	id            TEXT PRIMARY KEY,
	email         TEXT NOT NULL,                 -- normalized: trimmed + lowercased
	email_verified INTEGER NOT NULL DEFAULT 0,   -- 0/1; set once a login code is consumed
	created_at    INTEGER NOT NULL,
	updated_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- Revocable sessions. The cookie/bearer value is a raw random token; we store only its
-- SHA-256 hash, so a DB read leak can't be replayed as a live session.
CREATE TABLE sessions (
	token_hash   TEXT PRIMARY KEY,               -- sha256(raw token), hex
	user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	client       TEXT NOT NULL DEFAULT 'web',     -- 'web' | 'ios' — for display + selective revoke
	created_at   INTEGER NOT NULL,
	expires_at   INTEGER NOT NULL,
	last_used_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

-- Short-lived email codes for login and recovery. We store a hash of the 6-digit code,
-- never the plaintext. `attempts` caps brute-force; `consumed_at` makes it single-use.
CREATE TABLE email_tokens (
	id          TEXT PRIMARY KEY,
	user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code_hash   TEXT NOT NULL,                    -- sha256(code + id salt), hex
	purpose     TEXT NOT NULL,                    -- 'login' | 'recovery'
	created_at  INTEGER NOT NULL,
	expires_at  INTEGER NOT NULL,
	consumed_at INTEGER,
	attempts    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_email_tokens_user ON email_tokens (user_id);

-- WebAuthn passkeys. One row per registered credential; a user may have several
-- (phone, laptop, security key). `counter` is the signature counter for clone detection.
CREATE TABLE credentials (
	id           TEXT PRIMARY KEY,               -- base64url credential id
	user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	public_key   TEXT NOT NULL,                  -- base64url COSE public key
	counter      INTEGER NOT NULL DEFAULT 0,
	transports   TEXT,                           -- JSON array, e.g. ["internal","hybrid"]
	device_type  TEXT,                           -- 'singleDevice' | 'multiDevice'
	backed_up    INTEGER NOT NULL DEFAULT 0,
	label        TEXT,
	created_at   INTEGER NOT NULL,
	last_used_at INTEGER
);
CREATE INDEX idx_credentials_user ON credentials (user_id);

-- Pending WebAuthn challenges (registration + authentication). Short-lived, single-use.
-- user_id is NULL for usernameless (discoverable-credential) authentication.
CREATE TABLE webauthn_challenges (
	id         TEXT PRIMARY KEY,
	user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
	challenge  TEXT NOT NULL,                    -- base64url
	purpose    TEXT NOT NULL,                    -- 'register' | 'authenticate'
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

-- The synced engagement profile: one JSON blob per user (the client's Persisted shape).
-- Steady-state sync is last-write-wins on updated_at; first-login reconciliation merges
-- the local and server blobs (union title sets, max/sum token weights) in app code.
CREATE TABLE profiles (
	user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	data       TEXT NOT NULL,                    -- JSON (Persisted)
	updated_at INTEGER NOT NULL,
	revision   INTEGER NOT NULL DEFAULT 1        -- bumps each push; lets clients detect drift
);
