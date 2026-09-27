-- First-party Neo identity links contain no password hashes or reusable Neo sessions.
CREATE TABLE identity_links (
  user_id TEXT PRIMARY KEY REFERENCES users(id), issuer TEXT NOT NULL, subject TEXT NOT NULL,
  verified_email TEXT NOT NULL, linked_at BIGINT NOT NULL, UNIQUE(issuer,subject)
);
CREATE TABLE identity_flows (
  cookie_hash TEXT PRIMARY KEY, state_hash TEXT NOT NULL, verifier TEXT NOT NULL,
  invite_hash TEXT, link_user_id TEXT REFERENCES users(id), password_proof TEXT, expires_at BIGINT NOT NULL
);
CREATE TABLE identity_sessions (
  session_hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE,
  subject TEXT NOT NULL, auth_revision TEXT NOT NULL, checked_at BIGINT NOT NULL
);
