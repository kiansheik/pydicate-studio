'use strict';
const { randomUUID } = require('node:crypto');
const { fault } = require('./store.cjs');

/** List-only changes: never rewrite source files or manufacture review/acceptance. */
async function managePassages(store, project, input, user, clientId) {
    return store.transaction(async () => {
        const currentUser = await store.assertUser(user);
        if (currentUser.role !== 'admin') throw fault(403, 'ADMIN_REQUIRED', 'Somente administradores podem organizar passagens.');
        const { sourceId, passageId, orderedIds, action, storageRevision } = input;
        if (input.projectId !== project.id || !['reorder', 'duplicate', 'delete', 'restore'].includes(action))
            throw fault(400, 'INVALID_INPUT', 'Organização inválida.');
        const saved = await store.snapshot(project.id);
        if (storageRevision !== saved.envelope?.storageRevision)
            throw fault(409, 'DRAFT_CONFLICT', 'A lista mudou no servidor. Recarregue antes de organizá-la.');
        const drafts = saved.envelope.drafts;
        const sources = new Map(project.passages.map(p => [p.id, p.sourceId]));
        for (const draft of Object.values(drafts))
            if (draft.pending) sources.set(draft.passageId, draft.pending.sourceId);
        const active = [...sources.keys()].filter(id => drafts[id] && !drafts[id].organization?.deleted);
        const siblings = active.filter(id => sources.get(id) === sourceId);
        if (!Array.isArray(orderedIds) || orderedIds.length !== siblings.length ||
            new Set(orderedIds).size !== siblings.length || orderedIds.some(id => !siblings.includes(id)) ||
            !drafts[passageId] || sources.get(passageId) !== sourceId)
            throw fault(400, 'INVALID_ORDER', 'A lista deve conter exatamente as passagens desta fonte.');
        const order = [...orderedIds];
        const changed = new Map();
        let selectedId = passageId;
        const now = new Date(store.now()).toISOString();
        function put(id, draft) {
            changed.set(id, { id, version: saved.versions[id] ?? 0, draft: {
                ...draft, revisionId: randomUUID(), updatedAt: now,
            } });
        }
        if (action === 'restore') {
            if (!drafts[passageId].organization?.deleted) throw fault(400, 'INVALID_INPUT', 'Esta passagem já está na lista.');
            order.splice(Math.min(drafts[passageId].organization.position, order.length), 0, passageId);
        } else if (!order.includes(passageId)) {
            throw fault(400, 'INVALID_INPUT', 'Restaure a passagem antes de alterá-la.');
        }
        if (action === 'delete') {
            if (active.length <= 1) throw fault(400, 'LAST_PASSAGE', 'Crie outra passagem antes de excluir a última do projeto.');
            const index = order.indexOf(passageId);
            order.splice(index, 1);
            put(passageId, { ...drafts[passageId], organization: { sourceId, position: index, deleted: true } });
            selectedId = order[Math.min(index, order.length - 1)] ?? active.find(id => id !== passageId);
        }
        if (action === 'duplicate') {
            const original = drafts[passageId];
            const id = 'pending:' + randomUUID();
            const index = order.indexOf(passageId) + 1;
            const copy = structuredClone(original);
            delete copy.aiAcceptances;
            delete copy.organization;
            delete copy.workflow;
            copy.passageId = id;
            copy.sourceFingerprint = 'pending';
            copy.pending = { sourceId, ordinal: index + 1, previousPassageId: passageId, beforePassageId: order[index] ?? null };
            put(id, copy);
            order.splice(index, 0, id);
            selectedId = id;
        }
        order.forEach((id, position) => {
            const draft = changed.get(id)?.draft ?? drafts[id];
            const organization = { sourceId, position, deleted: false };
            if (JSON.stringify(draft.organization) !== JSON.stringify(organization)) put(id, { ...draft, organization });
        });
        const result = await store.patch(project.id, [...changed.values()], user, clientId, false, true);
        await store.audit(user.id, 'passage.' + action, passageId);
        return { ...await store.snapshot(project.id), changed: result.changed, selectedId };
    });
}
module.exports = { managePassages };
