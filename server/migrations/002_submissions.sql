-- A submitted version is a frozen scientific record, not a mutable draft or Git branch.
CREATE TABLE submissions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, passage_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id), draft_revision_id BIGINT NOT NULL REFERENCES revisions(id),
  snapshot TEXT NOT NULL, snapshot_sha256 TEXT NOT NULL, submitted_at BIGINT NOT NULL,
  UNIQUE(author_id,draft_revision_id)
);
CREATE INDEX submissions_passage ON submissions(project_id,passage_id,submitted_at);
CREATE TABLE submission_events (
  id BIGSERIAL PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id),
  actor_id TEXT REFERENCES users(id), event TEXT NOT NULL CHECK(event IN ('submitted','changes_requested','ready','imported','merged')),
  at BIGINT NOT NULL, details JSONB NOT NULL DEFAULT '{}'
);
CREATE TRIGGER submissions_immutable BEFORE UPDATE OR DELETE ON submissions FOR EACH ROW EXECUTE FUNCTION protect_research_record();
CREATE TRIGGER submission_events_immutable BEFORE UPDATE OR DELETE ON submission_events FOR EACH ROW EXECUTE FUNCTION protect_research_record();
CREATE TABLE publication_receipts (
  submission_id TEXT NOT NULL REFERENCES submissions(id), repository TEXT NOT NULL CHECK(repository IN ('oldtupicorpus','nhe-enga')),
  commit_sha TEXT NOT NULL, snapshot_sha256 TEXT NOT NULL, recorded_at BIGINT NOT NULL,
  PRIMARY KEY(submission_id,repository,commit_sha)
);
CREATE TABLE merge_notifications (
  id BIGSERIAL PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id), user_id TEXT NOT NULL REFERENCES users(id),
  commit_sha TEXT NOT NULL, merged_at BIGINT NOT NULL, sent_at BIGINT,
  UNIQUE(submission_id,commit_sha)
);
CREATE TABLE digest_batches (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), bucket TEXT NOT NULL,
  notification_ids JSONB NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','sending','sent')),
  updated_at BIGINT NOT NULL, UNIQUE(user_id,bucket)
);
