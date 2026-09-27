CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE CHECK(email=lower(email)),
  name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','reviewer','contributor')),
  password_hash TEXT, disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)), created_at BIGINT NOT NULL);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  csrf TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, last_seen BIGINT NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE password_tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE projects (id TEXT PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 0);
CREATE TABLE drafts (project_id TEXT NOT NULL REFERENCES projects(id), passage_id TEXT NOT NULL,
  version BIGINT NOT NULL, data TEXT, PRIMARY KEY(project_id,passage_id));
CREATE TABLE selections (user_id TEXT PRIMARY KEY REFERENCES users(id), passage_id TEXT NOT NULL);
CREATE TABLE claims (passage_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), client_id TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE comments (id BIGSERIAL PRIMARY KEY, passage_id TEXT NOT NULL, parent_id BIGINT REFERENCES comments(id),
  author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at BIGINT NOT NULL,
  resolved_by TEXT REFERENCES users(id), resolved_at BIGINT);
CREATE INDEX comments_passage ON comments(passage_id,id);
CREATE TABLE revisions (id BIGSERIAL PRIMARY KEY, project_id TEXT NOT NULL, passage_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id), at BIGINT NOT NULL, before_json TEXT, after_json TEXT);
CREATE INDEX revisions_passage ON revisions(project_id,passage_id,id);
CREATE TABLE audit (id BIGSERIAL PRIMARY KEY, user_id TEXT REFERENCES users(id), passage_id TEXT,
  event TEXT NOT NULL, at BIGINT NOT NULL, outcome TEXT NOT NULL, duration_ms INTEGER,
  origin TEXT NOT NULL CHECK(origin IN ('server','browser')), metadata JSONB NOT NULL DEFAULT '{}');
CREATE INDEX audit_at ON audit(at);
CREATE TABLE provider_settings (user_id TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL CHECK(provider IN ('codex','claude')),
  funding TEXT NOT NULL CHECK(funding IN ('disabled','owner','personal')), monthly_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK(monthly_limit_cents>=0),
  credential_ciphertext TEXT, updated_at BIGINT NOT NULL, PRIMARY KEY(user_id,provider));
CREATE TABLE research_exports (id TEXT PRIMARY KEY, at BIGINT NOT NULL, manifest JSONB NOT NULL);
CREATE TABLE migration_receipts (id TEXT PRIMARY KEY, at BIGINT NOT NULL, manifest JSONB NOT NULL);
-- Research records are append-only through the application. No retention job deletes them.
CREATE FUNCTION protect_research_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Research records are append-only'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION protect_research_record();
CREATE TRIGGER revision_immutable BEFORE UPDATE OR DELETE ON revisions FOR EACH ROW EXECUTE FUNCTION protect_research_record();
