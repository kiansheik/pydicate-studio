'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('./database.cjs');
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
    if (['__proto__', 'constructor', 'prototype'].includes(value))
        throw fault(400, 'INVALID_ID', 'Identificador inválido.');
    return value;
}
function stable(value) {
    if (Array.isArray(value))
        return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
}
const same = (a, b) => stable(a) === stable(b);
const CLAIM_MS = 120000;
const passageKey = id => identifier(id).replace(/^pending:/, 'passage:');
class Store {
    static async open(directory, options = {}) {
        const store = new Store(directory, options);
        try { await store.db.migrate(); return store; }
        catch(error) { await store.db.close(); throw error; }
    }
    constructor(directory, { now = Date.now, validateEnvelope = null, databaseUrl = process.env.COLLAB_DATABASE_URL, schema = 'public', passageClaims = process.env.COLLAB_PASSAGE_CLAIMS === '1' } = {}) {
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        this.db = new Database(databaseUrl, { schema });
        this.now = now;
        this.passageClaims = passageClaims;
        this.validateEnvelope = validateEnvelope;
        this.writes = new Map();
        this.context = {};
    }
    transaction(fn) { return this.db.transaction(fn); }
    publicUser(user) {
        return user ? { id: user.id, email: user.email, name: user.name, role: user.role, disabled: !!user.disabled, authMethod: user.external_subject ? "academia" : "local" } : null;
    }
    async user(id) { return await this.db.prepare("SELECT u.*,i.subject AS external_subject FROM users u LEFT JOIN identity_links i ON i.user_id=u.id WHERE u.id=$1").get(id); }
    async audit(userId, event, passageId = null, outcome = 'succeeded', duration = null, origin = 'server', details = {}) {
        await this.db.prepare("INSERT INTO audit(user_id,passage_id,event,at,outcome,duration_ms,origin,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .run(userId, passageId, event, this.now(), outcome, duration, origin, JSON.stringify({ schemaVersion: 1, ...this.context, ...details }));
    }
    async seed(project) {
        await this.transaction(async () => {
            await this.db.prepare("INSERT INTO projects(id) VALUES($1) ON CONFLICT DO NOTHING").run(project.id);
            const put = this.db.prepare("INSERT INTO drafts VALUES($1,$2,1,$3) ON CONFLICT DO NOTHING");
            for (const passage of project.passages) {
                const draft = {
                    passageId: passage.id, revisionId: randomUUID(), sourceFingerprint: passage.sourceFingerprint,
                    raw: passage.sourceExpression, diplomatic: passage.diplomatic, normalized: passage.normalized,
                    translation: passage.translation, notes: passage.notes, analysis: passage.analysis ?? null,
                    updatedAt: new Date(this.now()).toISOString(),
                    locators: { printedPage: passage.witness.printedPage ?? '', folio: passage.witness.folio ?? '',
                        line: passage.witness.textualLine == null ? '' : String(passage.witness.textualLine),
                        section: passage.witness.section ?? '', subsection: passage.witness.subsection ?? '',
                        ...(passage.witness.prayerName != null ? { prayerName: passage.witness.prayerName } : {}) },
                    ...(passage.translations ? { translations: passage.translations } : {}),
                };
                await put.run(project.id, passage.id, JSON.stringify(draft));
            }
            this.validateEnvelope?.((await this.snapshot(project.id)).envelope);
        });
    }
    async snapshot(projectId) {
        return this.db.transaction(() => this._snapshot(projectId), {readOnly: true});
    }
    async _snapshot(projectId) {
        const project = await this.db.prepare("SELECT revision FROM projects WHERE id=$1").get(projectId);
        if (!project)
            return { envelope: null, versions: {} };
        const drafts = Object.create(null), versions = Object.create(null);
        for (const row of await this.db.prepare("SELECT passage_id,version,data FROM drafts WHERE project_id=$1").all(projectId)) {
            versions[row.passage_id] = row.version;
            if (row.data !== null)
                drafts[row.passage_id] = JSON.parse(row.data);
        }
        return { envelope: { version: 1, projectId, storageRevision: project.revision, drafts }, versions };
    }
    async load(projectId) { return (await this.snapshot(projectId)).envelope; }
    async assertUser(user) {
        const current = await this.user(user.id);
        if (!current || current.disabled || (!current.password_hash && !current.external_subject))
            throw fault(401, 'SESSION_EXPIRED', 'Entre novamente.');
        return current;
    }
    async assertClaim(passageId, user, clientId, acquire = false) {
        return this.transaction(() => this._assertClaim(passageId, user, clientId, acquire));
    }
    async _assertClaim(passageId, user, clientId, acquire = false) {
        await this.assertUser(user);
        passageId = passageKey(passageId);
        identifier(clientId);
        if (!this.passageClaims) return;
        const row = await this.db.prepare("SELECT * FROM claims WHERE passage_id=$1 AND expires_at>$2").get(passageId, this.now());
        if (row && (row.user_id !== user.id || row.client_id !== clientId)) {
            throw fault(409, 'PASSAGE_BUSY', 'Outra pessoa ou aba está trabalhando nesta passagem. Seu rascunho local foi preservado.');
        }
        if (acquire)
            await this.db.prepare("INSERT INTO claims VALUES($1,$2,$3,$4) ON CONFLICT(passage_id)\n      DO UPDATE SET user_id=excluded.user_id,client_id=excluded.client_id,expires_at=excluded.expires_at")
                .run(passageId, user.id, clientId, this.now() + CLAIM_MS);
    }
    async release(passageId, user, clientId) {
        passageId = passageKey(passageId);
        await this.db.prepare("DELETE FROM claims WHERE passage_id=$1 AND user_id=$2 AND client_id=$3").run(passageId, user.id, clientId);
    }
    /**
     * Hand a passage back after its author is done with it, across every tab they
     * left it open in. Only that person's own claims are removed, so this can
     * never take a passage away from someone else.
     */
    async releaseOwned(passageId, user) {
        passageId = passageKey(passageId);
        await this.db.prepare("DELETE FROM claims WHERE passage_id=$1 AND user_id=$2").run(passageId, user.id);
    }
    async claimList() {
        if (!this.passageClaims) return [];
        return await this.db.prepare("SELECT c.passage_id AS \"passageId\",c.client_id AS \"clientId\",c.user_id AS \"userId\",\n      u.name,c.expires_at AS \"expiresAt\" FROM claims c JOIN users u ON u.id=c.user_id WHERE c.expires_at>$1 AND u.disabled=0").all(this.now());
    }
    async patch(projectId, changes, user, clientId, trustedAcceptance = false, trustedOrganization = false) {
        if (!Array.isArray(changes) || changes.length > (trustedOrganization ? 5000 : 200))
            throw fault(400, 'INVALID_PATCH', 'Alterações demais em um pedido.');
        return await this.transaction(async () => {
            await this.assertUser(user);
            const current = await this.snapshot(projectId);
            if (!current.envelope)
                throw fault(404, 'PROJECT_MISSING', 'Projeto desconhecido.');
            const next = structuredClone(current.envelope);
            const seen = new Set();
            for (const change of changes) {
                const id = identifier(change.id);
                if (seen.has(id) || !Number.isSafeInteger(change.version) || change.version < 0)
                    throw fault(400, 'INVALID_PATCH', 'Revisão inválida.');
                seen.add(id);
                if (change.version !== (current.versions[id] ?? 0))
                    throw fault(409, 'DRAFT_CONFLICT', 'Esta passagem mudou no servidor. Exporte suas edições e compare antes de recarregar.');
                await this.assertClaim(id, user, clientId, true);
                if (change.draft === null) {
                    // Only unpublished shells can be removed. Source passages retain their work history.
                    if (!id.startsWith('pending:'))
                        throw fault(400, 'DRAFT_DELETE', 'Uma passagem da fonte não pode ser removida por autosave.');
                    if (current.envelope.drafts[id]?.organization &&
                        !changes.some(c => c.id === id.replace(/^pending:/, 'passage:') && c.draft))
                        throw fault(400, 'DRAFT_DELETE', 'Use a organização de passagens para excluir esta entrada.');
                    delete next.drafts[id];
                }
                else {
                    if (!change.draft || change.draft.passageId !== id)
                        throw fault(400, 'INVALID_DRAFT', 'Passagem divergente.');
                    const draft = structuredClone(change.draft);
                    if (!trustedAcceptance) delete draft.aiAcceptances;
                    const old = current.envelope.drafts[id] ?? current.envelope.drafts[id.replace(/^passage:/, 'pending:')];
                    if (!trustedAcceptance && old?.aiAcceptances)
                        draft.aiAcceptances = structuredClone(old.aiAcceptances);
                    if (!trustedOrganization) {
                        delete draft.organization;
                        if (old?.organization) draft.organization = structuredClone(old.organization);
                        if (old?.organization?.deleted && !same(old, draft))
                            throw fault(409, 'PASSAGE_DELETED', 'Esta passagem foi excluída da lista. Recarregue para continuar.');
                    }
                    next.drafts[id] = draft;
                }
            }
            this.validateEnvelope?.(next);
            if (Buffer.byteLength(JSON.stringify(next)) > 64 * 1024 * 1024)
                throw fault(413, 'DRAFT_LIMIT', 'O espaço de trabalho excede 64 MiB; solicite paginação à administração.');
            const changed = [];
            for (const change of changes) {
                const id = change.id, before = current.envelope.drafts[id] ?? null, after = next.drafts[id] ?? null;
                if (same(before, after))
                    continue;
                const version = (current.versions[id] ?? 0) + 1;
                await this.db.prepare("INSERT INTO drafts VALUES($1,$2,$3,$4) ON CONFLICT(project_id,passage_id)\n          DO UPDATE SET version=excluded.version,data=excluded.data")
                    .run(projectId, id, version, after === null ? null : JSON.stringify(after));
                // Keep every acknowledged changed draft, not a coalesced last state.
                await this.db.prepare("INSERT INTO revisions(project_id,passage_id,user_id,at,before_json,after_json) VALUES($1,$2,$3,$4,$5,$6)")
                    .run(projectId, id, user.id, this.now(), before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after));
                await this.audit(user.id, 'draft.persist', id);
                current.versions[id] = version;
                changed.push(id);
            }
            if (changed.length)
                await this.db.prepare("UPDATE projects SET revision=revision+1 WHERE id=$1").run(projectId);
            return { storageRevision: current.envelope.storageRevision + Number(changed.length > 0), versions: current.versions, changed };
        });
    }
    async addComment(user, { passageId, body, parentId = null }) {
        passageId = passageKey(passageId);
        text(body, 4000);
        return await this.transaction(async () => {
            await this.assertUser(user);
            if (parentId !== null) {
                if (!Number.isSafeInteger(parentId))
                    throw fault(400, 'INVALID_THREAD', 'Discussão inválida.');
                const parent = await this.db.prepare("SELECT * FROM comments WHERE id=$1").get(parentId);
                if (!parent || parent.parent_id !== null || parent.passage_id !== passageId)
                    throw fault(400, 'INVALID_THREAD', 'Discussão inválida.');
            }
            const result = await this.db.prepare("INSERT INTO comments(passage_id,parent_id,author_id,body,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id")
                .run(passageId, parentId, user.id, body.trim(), this.now());
            await this.audit(user.id, 'comment.create', passageId);
            return { id: Number(result.lastInsertRowid) };
        });
    }
    async comments(passageId, after = 0) {
        passageId = passageKey(passageId);
        const rows = await this.db.prepare("SELECT c.id,c.passage_id AS \"passageId\",c.parent_id AS \"parentId\",c.body,\n      c.author_id AS \"authorId\",u.name AS author,c.created_at AS \"createdAt\",c.resolved_at AS \"resolvedAt\",\n      c.resolved_by AS \"resolvedBy\" FROM comments c JOIN users u ON c.author_id=u.id\n      WHERE c.passage_id=$1 AND c.id>$2 ORDER BY c.id LIMIT 201").all(passageId, after);
        return { comments: rows.slice(0, 200), next: rows.length > 200 ? rows[199].id : null };
    }
    async resolveComment(user, id, resolved) {
        return this.transaction(() => this._resolveComment(user, id, resolved));
    }
    async _resolveComment(user, id, resolved) {
        user = await this.assertUser(user);
        const comment = await this.db.prepare("SELECT * FROM comments WHERE id=$1").get(id);
        if (!comment || comment.parent_id !== null)
            throw fault(404, 'COMMENT_MISSING', 'Discussão desconhecida.');
        if (user.role === 'contributor' && comment.author_id !== user.id)
            throw fault(403, 'FORBIDDEN', 'Somente o autor ou um revisor pode resolver esta discussão.');
        await this.db.prepare("UPDATE comments SET resolved_by=$1,resolved_at=$2 WHERE id=$3")
            .run(resolved ? user.id : null, resolved ? this.now() : null, id);
        await this.audit(user.id, resolved ? 'comment.resolve' : 'comment.reopen', comment.passage_id);
        return { passageId: comment.passage_id };
    }
    async report(days = 7) {
        const cutoff = days === 0 ? 0 : this.now() - days * 86400000;
        return {
            days,
            operations: await this.db.prepare("SELECT a.user_id AS \"userId\",u.name,a.event,a.origin,a.outcome,\n        count(*) AS count,round(avg(a.duration_ms)) AS \"meanDurationMs\" FROM audit a LEFT JOIN users u ON u.id=a.user_id\n        WHERE a.at>=$1 GROUP BY a.user_id,u.name,a.event,a.origin,a.outcome ORDER BY count DESC LIMIT 1000").all(cutoff),
            contributions: await this.db.prepare("SELECT r.user_id AS \"userId\",u.name,count(*) AS checkpoints,\n        count(DISTINCT CASE WHEN r.passage_id LIKE 'pending:%' THEN 'passage:' || substr(r.passage_id,9) ELSE r.passage_id END) AS passages FROM revisions r LEFT JOIN users u ON u.id=r.user_id\n        WHERE r.at>=$1 GROUP BY r.user_id,u.name ORDER BY checkpoints DESC").all(cutoff),
            note: 'Presença e eventos de interface não comprovam horas trabalhadas, aprovação linguística ou direito a pagamento.',
        };
    }
    async cleanup() {
        const now = this.now();
        await this.db.query("DELETE FROM identity_flows WHERE expires_at<$1", [now]);
        await this.db.prepare("DELETE FROM sessions WHERE expires_at<$1 OR last_seen<$2").run(now, now - 2 * 60 * 60 * 1000);
        await this.db.prepare("DELETE FROM password_tokens WHERE expires_at<$1").run(now);
        await this.db.prepare("DELETE FROM claims WHERE expires_at<$1").run(now);
    }
    async close() { await this.db.close(); }
}
module.exports = { Store, fault, text, identifier, same, CLAIM_MS, passageKey };
