'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');

function fault(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
function text(value, max = 256, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    throw fault(400, 'INVALID_INPUT', 'Dados inválidos.');
  }
  return value;
}
function identifier(value) {
  text(value);
  if (['__proto__', 'constructor', 'prototype'].includes(value)) throw fault(400, 'INVALID_ID', 'Identificador inválido.');
  return value;
}
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
const same = (a, b) => stable(a) === stable(b);
const CLAIM_MS = 120_000;
const passageKey = id => identifier(id).replace(/^pending:/, 'passage:');

class Store {
  constructor(directory, { now = Date.now, validateEnvelope = null } = {}) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.filename = path.join(directory, 'collab.sqlite');
    this.db = new DatabaseSync(this.filename);
    fs.chmodSync(this.filename, 0o600);
    this.now = now;
    this.validateEnvelope = validateEnvelope;
    this.writes = new Map();
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('Newer collaboration database: use a matching Studio version.');
    if (!version) this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','reviewer','contributor')),
        password_hash TEXT, disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        csrf TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
      CREATE INDEX sessions_user ON sessions(user_id);
      CREATE TABLE password_tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE drafts (project_id TEXT NOT NULL REFERENCES projects(id), passage_id TEXT NOT NULL,
        version INTEGER NOT NULL, data TEXT, PRIMARY KEY(project_id, passage_id));
      CREATE TABLE selections (user_id TEXT PRIMARY KEY REFERENCES users(id), passage_id TEXT NOT NULL);
      CREATE TABLE claims (passage_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        client_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, passage_id TEXT NOT NULL,
        parent_id INTEGER REFERENCES comments(id), author_id TEXT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL, created_at INTEGER NOT NULL, resolved_by TEXT REFERENCES users(id), resolved_at INTEGER);
      CREATE INDEX comments_passage ON comments(passage_id,id);
      CREATE TABLE revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL,
        passage_id TEXT NOT NULL, user_id TEXT REFERENCES users(id), at INTEGER NOT NULL,
        before_json TEXT, after_json TEXT);
      CREATE INDEX revisions_passage ON revisions(project_id,passage_id,id);
      CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT REFERENCES users(id),
        passage_id TEXT, event TEXT NOT NULL, at INTEGER NOT NULL, outcome TEXT NOT NULL,
        duration_ms INTEGER, origin TEXT NOT NULL CHECK(origin IN ('server','browser')));
      CREATE INDEX audit_at ON audit(at);
      PRAGMA user_version=1;
      COMMIT;
    `);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      if (value && typeof value.then === 'function') throw new Error('Database transactions must be synchronous.');
      this.db.exec('COMMIT');
      return value;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  publicUser(user) {
    return user ? { id: user.id, email: user.email, name: user.name, role: user.role, disabled: !!user.disabled } : null;
  }
  user(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id); }
  audit(userId, event, passageId = null, outcome = 'succeeded', duration = null, origin = 'server') {
    this.db.prepare('INSERT INTO audit(user_id,passage_id,event,at,outcome,duration_ms,origin) VALUES(?,?,?,?,?,?,?)')
      .run(userId, passageId, event, this.now(), outcome, duration, origin);
  }
  seed(project) {
    this.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO projects(id) VALUES(?)').run(project.id);
      const put = this.db.prepare('INSERT OR IGNORE INTO drafts VALUES(?,?,1,?)');
      for (const passage of project.passages) {
        const draft = {
          passageId: passage.id, revisionId: randomUUID(), sourceFingerprint: passage.sourceFingerprint,
          raw: passage.sourceExpression, diplomatic: passage.diplomatic, normalized: passage.normalized,
          translation: passage.translation, notes: passage.notes, analysis: passage.analysis ?? null,
          updatedAt: new Date(this.now()).toISOString(),
          locators: { printedPage: passage.witness.printedPage ?? '', folio: passage.witness.folio ?? '',
            line: passage.witness.textualLine == null ? '' : String(passage.witness.textualLine),
            section: passage.witness.section ?? '', subsection: passage.witness.subsection ?? '' },
          ...(passage.translations ? { translations: passage.translations } : {}),
        };
        put.run(project.id, passage.id, JSON.stringify(draft));
      }
      this.validateEnvelope?.(this.snapshot(project.id).envelope);
    });
  }
  snapshot(projectId) {
    const project = this.db.prepare('SELECT revision FROM projects WHERE id=?').get(projectId);
    if (!project) return { envelope: null, versions: {} };
    const drafts = Object.create(null), versions = Object.create(null);
    for (const row of this.db.prepare('SELECT passage_id,version,data FROM drafts WHERE project_id=?').all(projectId)) {
      versions[row.passage_id] = row.version;
      if (row.data !== null) drafts[row.passage_id] = JSON.parse(row.data);
    }
    return { envelope: { version: 1, projectId, storageRevision: project.revision, drafts }, versions };
  }
  async load(projectId) { return this.snapshot(projectId).envelope; }
  assertUser(user) {
    const current = this.user(user.id);
    if (!current || current.disabled || !current.password_hash) throw fault(401, 'SESSION_EXPIRED', 'Entre novamente.');
    return current;
  }
  assertClaim(passageId, user, clientId, acquire = false) {
    passageId=passageKey(passageId); identifier(clientId);
    const row = this.db.prepare('SELECT * FROM claims WHERE passage_id=? AND expires_at>?').get(passageId, this.now());
    if (row && (row.user_id !== user.id || row.client_id !== clientId)) {
      throw fault(409, 'PASSAGE_BUSY', 'Outra pessoa ou aba está trabalhando nesta passagem. Seu rascunho local foi preservado.');
    }
    if (acquire) this.db.prepare(`INSERT INTO claims VALUES(?,?,?,?) ON CONFLICT(passage_id)
      DO UPDATE SET user_id=excluded.user_id,client_id=excluded.client_id,expires_at=excluded.expires_at`)
      .run(passageId, user.id, clientId, this.now() + CLAIM_MS);
  }
  release(passageId, user, clientId) {
    passageId=passageKey(passageId);
    this.db.prepare('DELETE FROM claims WHERE passage_id=? AND user_id=? AND client_id=?').run(passageId, user.id, clientId);
  }
  claimList() {
    return this.db.prepare(`SELECT c.passage_id AS passageId,c.client_id AS clientId,c.user_id AS userId,
      u.name,c.expires_at AS expiresAt FROM claims c JOIN users u ON u.id=c.user_id WHERE c.expires_at>? AND u.disabled=0`).all(this.now());
  }
  patch(projectId, changes, user, clientId) {
    if (!Array.isArray(changes) || changes.length > 200) throw fault(400, 'INVALID_PATCH', 'Alterações demais em um pedido.');
    return this.transaction(() => {
      this.assertUser(user);
      const current = this.snapshot(projectId);
      if (!current.envelope) throw fault(404, 'PROJECT_MISSING', 'Projeto desconhecido.');
      const next = structuredClone(current.envelope);
      const seen = new Set();
      for (const change of changes) {
        const id = identifier(change.id);
        if (seen.has(id) || !Number.isSafeInteger(change.version) || change.version < 0) throw fault(400, 'INVALID_PATCH', 'Revisão inválida.');
        seen.add(id);
        if (change.version !== (current.versions[id] ?? 0)) throw fault(409, 'DRAFT_CONFLICT', 'Esta passagem mudou no servidor. Exporte suas edições e compare antes de recarregar.');
        this.assertClaim(id, user, clientId, true);
        if (change.draft === null) {
          // Only unpublished shells can be removed. Source passages retain their work history.
          if (!id.startsWith('pending:')) throw fault(400, 'DRAFT_DELETE', 'Uma passagem da fonte não pode ser removida por autosave.');
          delete next.drafts[id];
        } else {
          if (!change.draft || change.draft.passageId !== id) throw fault(400, 'INVALID_DRAFT', 'Passagem divergente.');
          const draft = structuredClone(change.draft);
          delete draft.aiAcceptances;
          const old = current.envelope.drafts[id] ?? current.envelope.drafts[id.replace(/^passage:/, 'pending:')];
          if (old?.aiAcceptances) draft.aiAcceptances = structuredClone(old.aiAcceptances);
          next.drafts[id] = draft;
        }
      }
      this.validateEnvelope?.(next);
      if (Buffer.byteLength(JSON.stringify(next)) > 4 * 1024 * 1024) throw fault(413, 'DRAFT_LIMIT', 'Os rascunhos excedem 4 MiB.');
      const changed = [];
      for (const change of changes) {
        const id = change.id, before = current.envelope.drafts[id] ?? null, after = next.drafts[id] ?? null;
        if (same(before, after)) continue;
        const version = (current.versions[id] ?? 0) + 1;
        this.db.prepare(`INSERT INTO drafts VALUES(?,?,?,?) ON CONFLICT(project_id,passage_id)
          DO UPDATE SET version=excluded.version,data=excluded.data`)
          .run(projectId, id, version, after === null ? null : JSON.stringify(after));
        // Autosave checkpoints, not keystroke recordings. Retain the original before-image
        // while coalescing one author's consecutive changes within a 30-second window.
        const checkpoint = this.db.prepare('SELECT id,user_id,at FROM revisions WHERE project_id=? AND passage_id=? ORDER BY id DESC LIMIT 1').get(projectId,id);
        if (checkpoint?.user_id === user.id && this.now()-checkpoint.at < 30_000) {
          this.db.prepare('UPDATE revisions SET after_json=? WHERE id=?').run(after===null?null:JSON.stringify(after),checkpoint.id);
        } else this.db.prepare('INSERT INTO revisions(project_id,passage_id,user_id,at,before_json,after_json) VALUES(?,?,?,?,?,?)')
          .run(projectId, id, user.id, this.now(), before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after));
        this.audit(user.id, 'draft.persist', id);
        current.versions[id] = version;
        changed.push(id);
      }
      if (changed.length) this.db.prepare('UPDATE projects SET revision=revision+1 WHERE id=?').run(projectId);
      return { storageRevision: current.envelope.storageRevision + Number(changed.length > 0), versions: current.versions, changed };
    });
  }
  addComment(user, { passageId, body, parentId = null }) {
    passageId=passageKey(passageId); text(body, 4000);
    return this.transaction(() => {
      this.assertUser(user);
      if (parentId !== null) {
        if (!Number.isSafeInteger(parentId)) throw fault(400, 'INVALID_THREAD', 'Discussão inválida.');
        const parent = this.db.prepare('SELECT * FROM comments WHERE id=?').get(parentId);
        if (!parent || parent.parent_id !== null || parent.passage_id !== passageId) throw fault(400, 'INVALID_THREAD', 'Discussão inválida.');
      }
      const result = this.db.prepare('INSERT INTO comments(passage_id,parent_id,author_id,body,created_at) VALUES(?,?,?,?,?)')
        .run(passageId, parentId, user.id, body.trim(), this.now());
      this.audit(user.id, 'comment.create', passageId);
      return { id: Number(result.lastInsertRowid) };
    });
  }
  comments(passageId, after = 0) {
    passageId=passageKey(passageId);
    const rows = this.db.prepare(`SELECT c.id,c.passage_id AS passageId,c.parent_id AS parentId,c.body,
      c.author_id AS authorId,u.name AS author,c.created_at AS createdAt,c.resolved_at AS resolvedAt,
      c.resolved_by AS resolvedBy FROM comments c JOIN users u ON c.author_id=u.id
      WHERE c.passage_id=? AND c.id>? ORDER BY c.id LIMIT 201`).all(passageId, after);
    return { comments: rows.slice(0,200), next: rows.length > 200 ? rows[199].id : null };
  }
  resolveComment(user, id, resolved) {
    const comment = this.db.prepare('SELECT * FROM comments WHERE id=?').get(id);
    if (!comment || comment.parent_id !== null) throw fault(404, 'COMMENT_MISSING', 'Discussão desconhecida.');
    if (user.role === 'contributor' && comment.author_id !== user.id) throw fault(403, 'FORBIDDEN', 'Somente o autor ou um revisor pode resolver esta discussão.');
    this.db.prepare('UPDATE comments SET resolved_by=?,resolved_at=? WHERE id=?')
      .run(resolved ? user.id : null, resolved ? this.now() : null, id);
    this.audit(user.id, resolved ? 'comment.resolve' : 'comment.reopen', comment.passage_id);
    return { passageId: comment.passage_id };
  }
  report(days = 7) {
    const cutoff = this.now() - days * 86_400_000;
    return {
      days,
      operations: this.db.prepare(`SELECT a.user_id AS userId,u.name,a.event,a.origin,a.outcome,
        count(*) AS count,round(avg(a.duration_ms)) AS meanDurationMs FROM audit a LEFT JOIN users u ON u.id=a.user_id
        WHERE a.at>=? GROUP BY a.user_id,a.event,a.origin,a.outcome ORDER BY count DESC LIMIT 1000`).all(cutoff),
      contributions: this.db.prepare(`SELECT r.user_id AS userId,u.name,count(*) AS checkpoints,
        count(DISTINCT CASE WHEN r.passage_id LIKE 'pending:%' THEN 'passage:' || substr(r.passage_id,9) ELSE r.passage_id END) AS passages FROM revisions r LEFT JOIN users u ON u.id=r.user_id
        WHERE r.at>=? GROUP BY r.user_id ORDER BY checkpoints DESC`).all(cutoff),
      note: 'Presença e eventos de interface não comprovam horas trabalhadas, aprovação linguística ou direito a pagamento.',
    };
  }
  cleanup(days = 90) {
    const now = this.now();
    this.db.prepare('DELETE FROM sessions WHERE expires_at<? OR last_seen<?').run(now, now - 2*60*60*1000);
    this.db.prepare('DELETE FROM password_tokens WHERE expires_at<?').run(now);
    this.db.prepare('DELETE FROM claims WHERE expires_at<?').run(now);
    this.db.prepare('DELETE FROM audit WHERE at<?').run(now - days * 86_400_000);
  }
  close() { this.db.close(); }
}
module.exports = { Store, fault, text, identifier, same, CLAIM_MS, passageKey };
