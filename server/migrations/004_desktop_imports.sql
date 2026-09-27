CREATE TABLE desktop_imports (
  snapshot_sha256 TEXT PRIMARY KEY CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  project_id TEXT NOT NULL REFERENCES projects(id),
  imported_at BIGINT NOT NULL,
  receipt JSONB NOT NULL
);
CREATE TRIGGER desktop_import_immutable BEFORE UPDATE OR DELETE ON desktop_imports
  FOR EACH ROW EXECUTE FUNCTION protect_research_record();
