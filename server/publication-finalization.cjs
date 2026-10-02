'use strict';
const { createHash } = require('node:crypto');
const { fault, passageKey, stable, same, sourceDraft } = require('./store.cjs');
const digest = value => createHash('sha256').update(stable(value)).digest('hex');
const conflict = () => fault(409, 'DRAFT_CONFLICT', 'O rascunho mudou desde a prévia. Recarregue e confira a versão atual antes de publicar.');
function samePublishedExpression(actual, reviewed) {
    if (typeof actual !== 'string' || typeof reviewed !== 'string') return false;
    const source = actual.trim(), raw = reviewed.trim();
    // The Python source reader trims outer whitespace; passage_insertion adds
    // one enclosing pair to multiline expressions. Preserve every inner byte.
    return source === raw || (reviewed.includes('\n') && source.startsWith('(') && source.endsWith(')') &&
        source.slice(1, -1).trim() === raw);
}

// Mirror the list's stable pending anchors and administrator ranks, using saved
// metadata only. An already published alias keeps the pending row's old slot.
function visibleIds(project, drafts, sourceId) {
    const pending = Object.values(drafts).filter(d => d.passageId.startsWith('pending:'))
        .sort((a, b) => (a.pending?.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.pending?.ordinal ?? Number.MAX_SAFE_INTEGER));
    const published = new Map(project.passages.filter(p => !p.id.startsWith('pending:')).map(p => [p.id, p]));
    const aliases = new Map(pending.flatMap(draft => {
        const canonical = published.get(passageKey(draft.passageId));
        return canonical && canonical.sourceId === draft.pending?.sourceId ? [[draft.passageId, canonical.id]] : [];
    }));
    const materialized = new Set(aliases.values());
    const rows = [...published.values()].filter(p => !materialized.has(p.id));
    const waiting = [...pending];
    for (let attempts = 0; waiting.length && attempts <= pending.length; attempts++) {
        const draft = waiting.shift(), pendingBefore = draft.pending?.beforePassageId;
        const before = aliases.get(pendingBefore) ?? pendingBefore;
        if (pendingBefore?.startsWith('pending:') && !rows.some(p => p.id === before) &&
            waiting.some(d => d.passageId === pendingBefore) && attempts < pending.length) {
            waiting.push(draft); continue;
        }
        attempts = 0;
        const index = rows.findIndex(p => p.id === before);
        rows.splice(index < 0 ? rows.length : index, 0,
            published.get(aliases.get(draft.passageId)) ?? { id: draft.passageId,
                sourceId: draft.pending?.sourceId ?? 'araujo_catecismo_1686' });
    }
    const ids = rows.filter(p => p.sourceId === sourceId).map(p => p.id);
    const organization = id => drafts[id]?.organization ?? drafts[id.replace(/^passage:/, 'pending:')]?.organization;
    const pendingDraft = id => drafts[id]?.pending ?? drafts[id.replace(/^passage:/, 'pending:')]?.pending;
    if (!ids.some(id => organization(id))) return ids;
    const unranked = ids.filter(id => !organization(id) && (id.startsWith('pending:') || pendingDraft(id)));
    const ordered = ids.filter(id => !unranked.includes(id))
        .sort((a, b) => (organization(a)?.position ?? Number.MAX_SAFE_INTEGER) - (organization(b)?.position ?? Number.MAX_SAFE_INTEGER));
    for (let attempts = 0; unranked.length && attempts <= unranked.length; attempts++) {
        const id = unranked.shift();
        const anchor = pendingDraft(id)?.beforePassageId;
        const before = anchor && !ids.includes(anchor) ? passageKey(anchor) : anchor;
        if (before && unranked.includes(before) && attempts < unranked.length) {
            unranked.push(id); continue;
        }
        attempts = -1;
        const index = ordered.indexOf(before);
        ordered.splice(index < 0 ? ordered.length : index, 0, id);
    }
    return ordered.filter(id => !organization(id)?.deleted);
}

async function capturePublication(store, project, params) {
    if (!String(params.passageId).startsWith('pending:')) return null;
    const saved = await store.snapshot(project.id), draft = saved.envelope?.drafts[params.passageId];
    const canonicalId = passageKey(params.passageId);
    if (!draft?.pending || draft.raw !== params.raw || draft.pending.sourceId !== params.sourceId ||
        params.newPassageId !== canonicalId || draft.organization?.deleted) throw conflict();
    if (project.passages.some(p => p.id === canonicalId) || saved.envelope.drafts[canonicalId])
        throw fault(409, 'PASSAGE_ALREADY_PUBLISHED', 'Esta passagem já está na fonte. Recarregue para continuar na entrada publicada.');
    return { projectId: project.id, pendingId: params.passageId, canonicalId, sourceId: params.sourceId,
        pendingVersion: saved.versions[params.passageId], canonicalVersion: saved.versions[canonicalId] ?? 0,
        pendingDigest: digest(draft) };
}

function planMigration(project, saved, receipt, target) {
    const drafts = saved.envelope.drafts, pending = drafts[receipt.pendingId];
    const canonical = { ...structuredClone(pending), passageId: receipt.canonicalId,
        raw: target.sourceExpression, sourceFingerprint: target.sourceFingerprint };
    delete canonical.pending;
    const changes = [
        { id: receipt.pendingId, version: saved.versions[receipt.pendingId], draft: null },
        { id: receipt.canonicalId, version: saved.versions[receipt.canonicalId] ?? 0, draft: canonical },
    ];
    const order = visibleIds(project, drafts, receipt.sourceId);
    for (const [id, draft] of Object.entries(drafts)) {
        if (id === receipt.pendingId || draft.pending?.sourceId !== receipt.sourceId) continue;
        const position = order.indexOf(id);
        const next = position < 0 ? draft.pending.beforePassageId : order[position + 1] ?? null;
        const anchors = { ...draft.pending,
            beforePassageId: next === receipt.pendingId ? receipt.canonicalId : next,
            ...(draft.pending.previousPassageId === receipt.pendingId ? { previousPassageId: receipt.canonicalId } : {}),
        };
        if (!same(anchors, draft.pending)) changes.push({ id, version: saved.versions[id], draft: { ...draft, pending: anchors } });
    }
    // Freeze the actual visible order only at this identity transition. This
    // preserves administrator order without changing how unrelated lists sort.
    order.forEach((oldId, position) => {
        const id = oldId === receipt.pendingId ? receipt.canonicalId : oldId;
        let change = changes.find(item => item.id === id);
        const draft = change?.draft ?? drafts[id] ?? sourceDraft(project.passages.find(p => p.id === id));
        const organization = { sourceId: receipt.sourceId, position, deleted: false };
        if (same(draft.organization, organization)) return;
        if (!change) {
            change = { id, version: saved.versions[id] ?? 0, draft: { ...draft } };
            changes.push(change);
        }
        change.draft = { ...draft, organization };
    });
    return changes;
}

async function preflight(store, project, saved, receipt, target, user, clientId) {
    const current = await store.assertUser(user);
    if (!['admin', 'reviewer'].includes(current.role)) throw fault(403, 'REVIEWER_REQUIRED', 'Somente revisores podem publicar na fonte.');
    if (project.id !== receipt.projectId || !saved.envelope ||
        saved.versions[receipt.pendingId] !== receipt.pendingVersion ||
        (saved.versions[receipt.canonicalId] ?? 0) !== receipt.canonicalVersion ||
        !saved.envelope.drafts[receipt.pendingId] ||
        digest(saved.envelope.drafts[receipt.pendingId]) !== receipt.pendingDigest) throw conflict();
    const changes = planMigration(project, saved, receipt, target);
    const next = structuredClone(saved.envelope);
    for (const change of changes) {
        await store.assertClaim(change.id, user, clientId, true);
        if (change.draft) next.drafts[change.id] = change.draft;
        else delete next.drafts[change.id];
    }
    store.validateEnvelope?.(next);
    if (changes.length > 5000 || Buffer.byteLength(JSON.stringify(next)) > 64 * 1024 * 1024)
        throw fault(413, 'DRAFT_LIMIT', 'O espaço de trabalho excede o limite de publicação.');
    return changes;
}

async function persistMigration(store, project, changes, user, clientId, event) {
    const result = await store.patch(project.id, changes, user, clientId, true, true);
    await store.audit(user.id, event, changes[1].id, 'succeeded', null, 'server', { pendingId: changes[0].id });
    return { projectId: project.id, storageRevision: result.storageRevision,
        changes: changes.filter(change => result.changed.includes(change.id))
            .map(change => ({ ...change, version: result.versions[change.id] })) };
}

// PostgreSQL serializes autosaves through this complete transition. Source-file
// publication retains its own journal: a process/storage failure across the two
// resources requires explicit, exact-version recovery below, never dedup by text.
async function finalizePublication({ store, project, receipt, publishedRaw, apply, user, clientId }) {
    return store.transaction(async () => {
        const saved = await store.snapshot(project.id);
        if (saved.envelope?.drafts[receipt.canonicalId] || project.passages.some(p => p.id === receipt.canonicalId))
            throw fault(409, 'PASSAGE_ALREADY_PUBLISHED', 'Esta passagem já está na fonte. Recarregue antes de continuar.');
        await preflight(store, project, saved, receipt,
            { sourceExpression: publishedRaw, sourceFingerprint: 'publication-preflight' }, user, clientId);
        const nextProject = await apply();
        const target = nextProject.passages.find(p => p.id === receipt.canonicalId && p.sourceId === receipt.sourceId);
        if (!target || !samePublishedExpression(target.sourceExpression, publishedRaw))
            throw fault(409, 'PUBLISHED_PASSAGE_MISSING', 'A fonte foi salva, mas a identidade publicada precisa de recuperação. Seus rascunhos foram preservados.');
        const changes = planMigration(project, saved, receipt, target);
        const draftPublication = await persistMigration(store, nextProject, changes, user, clientId, 'passage.publish.finalize');
        return { ...nextProject, draftPublication };
    });
}

// An explicit administrative recovery, not an HTTP method or automatic cleanup.
// Callers must inspect and provide both exact versions and full-content hashes.
async function recoverPublishedPassage({ store, project, pendingId, pendingVersion, canonicalVersion,
    pendingDigest, canonicalDigest, user, clientId }) {
    return store.transaction(async () => {
        if ((await store.assertUser(user)).role !== 'admin') throw fault(403, 'ADMIN_REQUIRED', 'Somente a administração pode recuperar a publicação.');
        const saved = await store.snapshot(project.id), pending = saved.envelope?.drafts[pendingId];
        const canonicalId = passageKey(pendingId), canonical = saved.envelope?.drafts[canonicalId];
        const target = project.passages.find(p => p.id === canonicalId && p.sourceId === pending?.pending?.sourceId);
        if (!pendingId.startsWith('pending:') || !pending?.pending || !target ||
            (saved.versions[canonicalId] ?? 0) !== canonicalVersion || digest(canonical ?? null) !== canonicalDigest)
            throw conflict();
        if (canonical) {
            if (canonical.raw !== target.sourceExpression || canonical.sourceFingerprint !== target.sourceFingerprint) throw conflict();
            // A regenerated source draft may omit pending-only metadata. Even
            // an explicit clearing of an existing field needs a human merge.
            const ignored = new Set(['passageId', 'pending', 'raw', 'sourceFingerprint', 'revisionId', 'updatedAt', 'canvas']);
            for (const [key, value] of Object.entries(canonical)) {
                if (ignored.has(key)) continue;
                if (!same(value, pending[key])) throw conflict();
            }
            const canvas = canonical.canvas;
            if (!same(canvas, pending.canvas) && (canonicalVersion > 1 ||
                canvas && (canvas.fragments?.length || Object.keys(canvas.positions ?? {}).length))) throw conflict();
        }
        const receipt = { projectId: project.id, pendingId, canonicalId, sourceId: target.sourceId,
            pendingVersion, canonicalVersion, pendingDigest };
        const changes = await preflight(store, project, saved, receipt, target, user, clientId);
        return persistMigration(store, project, changes, user, clientId, 'passage.publish.recover');
    });
}

module.exports = { capturePublication, finalizePublication, recoverPublishedPassage, visibleIds, digest };
