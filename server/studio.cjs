'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const { METHODS: AI, createHostedAI } = require('./ai.cjs');
const { fault, identifier } = require('./store.cjs');
const { capturePublication, finalizePublication } = require('./publication-finalization.cjs');
// Deliberately NOT the entire desktop bridge. New desktop methods stay denied.
const READ = new Set(`corpus_health render learning_library parse_expression evaluate_expression predicate_catalog
predicate_create composition_define node_definition source_preview source_new_preview source_create
lexicon_search structure_prepare structure_search structure_resolve lexicon_inspect lexicon_create lexicon_update lexicon_tree_evaluate lexicon_tree_preview
dictionary_search dictionary_lookup dictionary_entry_get dictionary_predicate assistant_context
reference_verify reference_status passage_lexicon evidence_status evidence_bytes evidence_save
lexical_notes_list lexical_notes_save lexical_notes_export`.split(/\s+/));
const REVIEW = new Set(['source_apply', 'reference_approve', 'contribution_prepare']);
const PREVIEW = new Set(['source_preview', 'source_new_preview', 'lexicon_create', 'lexicon_update', 'lexicon_tree_preview', 'composition_define']);
function authorizeMethod(method, role, aiEnabled = false) {
    if (aiEnabled && AI.has(method)) return;
    if (!READ.has(method) && !REVIEW.has(method))
        throw fault(403, 'HOSTED_UNAVAILABLE', 'Esta operação não está habilitada nesta configuração do servidor colaborativo.');
    if (REVIEW.has(method) && !['reviewer', 'admin'].includes(role))
        throw fault(403, 'REVIEWER_REQUIRED', 'Somente revisores podem publicar na fonte ou aprovar referências.');
}
class Queue {
    constructor() { this.tail = Promise.resolve(); this.count = 0; this.users = new Map(); }
    run(userId, action) {
        if (this.count >= 32 || (this.users.get(userId) || 0) >= 8)
            return Promise.reject(fault(429, 'ENGINE_BUSY', 'Aguarde as operações em andamento.'));
        this.count++;
        this.users.set(userId, (this.users.get(userId) || 0) + 1);
        const pending = this.tail.catch(() => { }).then(action);
        this.tail = pending;
        return pending.finally(() => { this.count--; this.users.set(userId, this.users.get(userId) - 1); });
    }
}
async function createStudio(config, store, emit = () => { }) {
    // Lazy imports allow HTTP/auth tests to run without Electron or corpus fixtures.
    const { PythonWorker } = require('../runtime/python-worker.cjs');
    const { createNextService } = require('../runtime/next-service.cjs');
    const validate = require('../runtime/validation.cjs');
    let project, worker, pickedFile = null, service;
    const queue = new Queue(), previews = new Map();
    let deferSourceChange = false, deferredSourceChange = false;
    function sourceChanged() {
        if (deferSourceChange) { deferredSourceChange = true; return; }
        emit({ type: 'source-change', projectId: project.id, engineFingerprint: project.engineFingerprint });
    }
    // Each contributor's Claude Code sign-in lives in their own private home.
    // The provider resolves it from the request in flight, so a job always runs
    // under the account of the person who asked for it.
    const { ClaudeAuth } = require('./claude-auth.cjs');
    const { ClaudeCodeProvider } = require('../runtime/provider-claude-code.cjs');
    const claudeAuth = new ClaudeAuth({ directory: config.claudeHomeDirectory });
    const hostedAI = createHostedAI({ store, emit, claudeStatus: user => claudeAuth.status(user) });
    const claudeCode = new ClaudeCodeProvider({
        resolveHome: async () => {
            const user = hostedAI.currentUser();
            if (!user) throw new Error('Entre na sua conta antes de usar o Claude Code.');
            return claudeAuth.home(user);
        },
    });
    // SMTP and provider secrets are not inherited by the grammar process.
    const workerEnv = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT', 'VIRTUAL_ENV']
        .filter(k => process.env[k]).map(k => [k, process.env[k]]));
    function makeWorker() {
        return new PythonWorker({ executable: config.python,
            script: path.join(config.applicationDirectory, 'python/worker.py'),
            stateDirectory: path.join(config.stateDirectory, 'projects'),
            spawnProcess: (file, args, options) => spawn(file, args, { ...options, env: { ...workerEnv,
                    PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' } }),
        });
    }
    async function open() {
        const candidate = makeWorker();
        try {
            const next = validate.project(await candidate.request('open_project', { parentPath: config.parent }));
            if (project && next.id !== project.id)
                throw new Error('Project identity changed. Restart after reviewing the server workspace.');
            if (project && next.engineFingerprint === project.engineFingerprint && worker && !worker.failed) {
                candidate.close();
                return project;
            }
            const initial = !project;
            worker?.close();
            worker = candidate;
            project = next;
            store.context = {projectId: project.id, engineFingerprint: project.engineFingerprint, appRelease: config.release || 'development'};
            if (initial)
                await store.seed(project);
            return project;
        }
        catch (error) {
            candidate.close();
            throw error;
        }
    }
    await open();
    let dictionarySite, dictionaryOrigin;
    function currentDictionary() {
        if (!dictionarySite || dictionaryOrigin !== config.origin) {
            dictionaryOrigin = config.origin;
            dictionarySite = require('../runtime/dictionary-site.cjs').createDictionarySite({
                getProject: () => project, origin: config.origin, parentOrigin: config.origin,
            });
        }
        return dictionarySite;
    }
    const dictionary = {status: params => currentDictionary().status(params), handle: request => currentDictionary().handle(request)};
    service = createNextService({ stateDirectory: config.stateDirectory, applicationDirectory: config.applicationDirectory,
        providerAdapters: { 'claude-code': claudeCode },
        draftStore: hostedAI.drafts, getProject: () => project, getWorker: () => worker, getParent: () => config.parent,
        defaultParent: config.parent, openPath: open,
        // Health already holds the request queue; do not enqueue a nested reload.
        refreshHealth: open,
        reloadProject: () => queue.run('grammar-reload', async () => {
            const next = await open();
            emit({type:'source-change',projectId:next.id,engineFingerprint:next.engineFingerprint});
            return next;
        }), emit,
        duringProjectWrite: action => action(),
        adoptProject: value => { project = validate.project(value); store.context = {projectId:project.id,engineFingerprint:project.engineFingerprint,appRelease:config.release||'development'}; },
        chooseFile: async () => pickedFile,
    });
    const hasPassage = async (id) => {
        if (project.passages.some(p => p.id === id)) return true;
        const drafts = (await store.snapshot(project.id)).envelope?.drafts || {};
        return !!(drafts[id] || drafts[id.replace(/^passage:/, 'pending:')]);
    };
    async function passage(id, pending = false) {
        identifier(id);
        if (!await hasPassage(id) && !(pending && /^pending:[a-f0-9-]{36}$/.test(id)))
            throw fault(404, 'PASSAGE_MISSING', 'Passagem desconhecida.');
        return id;
    }
    async function evidenceContext(params) {
        if (!project.sources?.some(s => s.id === params.sourceId) && !project.passages.some(p => p.sourceId === params.sourceId))
            throw fault(400, 'SOURCE_MISSING', 'Fonte desconhecida.');
        const sourcePassage = project.passages.find(p => p.id === params.passageId);
        // PDF evidence already uses the reserved publication UUID before the
        // draft's first autosave. Resolve its pending alias for validation only.
        const draftId = sourcePassage ? params.passageId : String(params.passageId).replace(/^passage:/, 'pending:');
        await passage(draftId, true);
        const draft = (await store.snapshot(project.id)).envelope?.drafts[draftId];
        if ((sourcePassage && sourcePassage.sourceId !== params.sourceId) ||
            (draft?.pending && draft.pending.sourceId !== params.sourceId))
            throw fault(400, 'SOURCE_MISMATCH', 'A passagem pertence a outra fonte.');
        return draftId;
    }
    async function validateChanges(changes) {
        if (!Array.isArray(changes))
            throw fault(400, 'INVALID_PATCH', 'Alterações inválidas.');
        const sources = new Set([...(project.sources || []).map(s => s.id), ...project.passages.map(p => p.sourceId)]);
        for (const change of changes) {
            await passage(change.id, true);
            if (change.draft?.pending && !sources.has(change.draft.pending.sourceId))
                throw fault(400, 'SOURCE_MISSING', 'Fonte desconhecida.');
        }
    }
    async function invoke(method, input, context) {
        if (method === 'dictionary_status') return dictionary.status(input);
        return queue.run(context.user.id, () => invokeNow(method, input, context));
    }
    async function invokeNow(method, input, context) {
        if (method === 'dictionary_status')
            return dictionary.status(input);
        if (!READ.has(method) && !REVIEW.has(method) && !(config.aiEnabled && AI.has(method)))
            throw fault(403, 'HOSTED_UNAVAILABLE', 'Esta operação não está habilitada nesta configuração do servidor colaborativo.');
        {
            if(store.db.unavailable) throw fault(503, 'DATABASE_UNAVAILABLE', 'Banco de dados indisponível.');
            const user = await store.assertUser(context.user);
            authorizeMethod(method, user.role, config.aiEnabled);
            const params = structuredClone(input);
            if (params.projectId && params.projectId !== project.id)
                throw fault(403, 'PROJECT_MISMATCH', 'Projeto inválido.');
            // File selection, parent directories and shell/provider settings never come from HTTP.
            for (const key of ['parentPath', 'stateDirectory', 'corpusPath', 'enginePath', 'filePath', 'directory']) {
                if (Object.hasOwn(params, key))
                    throw fault(400, 'PATH_FORBIDDEN', 'Caminhos locais não são aceitos.');
            }
            params.projectId = project.id;
            let target = params.passageId, publicationPreview;
            if (target) {
                if (method.startsWith('evidence_')) target = await evidenceContext(params);
                else await passage(target, true);
            }
            if (method === 'source_apply') {
                const preview = previews.get(params.previewId);
                if (!preview || preview.userId !== user.id || preview.clientId !== context.clientId || preview.expires < store.now())
                    throw fault(409, 'PREVIEW_REQUIRED', 'Gere e revise uma nova prévia nesta sessão.');
                target = preview.passageId;
                publicationPreview = preview;
            }
            if (['evidence_save', 'reference_approve', 'source_apply'].includes(method) && target)
                await store.assertClaim(target, user, context.clientId, true);
            if (method === 'lexical_notes_save') {
                if (params.note?.passageId) {
                    await passage(params.note.passageId, true);
                    await store.assertClaim(params.note.passageId, user, context.clientId, true);
                    target = params.note.passageId;
                }
                params.note = { ...params.note, provenance: { ...params.note?.provenance, collaboration: { userId: user.id, name: user.name } } };
            }
            const started = performance.now();
            try {
                // Capture the exact saved draft before evaluating the preview;
                // later autosaves invalidate this receipt instead of being lost.
                const publication = method === 'source_new_preview'
                    ? await capturePublication(store, project, params) : null;
                const result = method === 'source_apply' && publicationPreview?.publication
                    ? await finalizePublication({ store, project, receipt: publicationPreview.publication,
                        publishedRaw: publicationPreview.publishedRaw, apply: () => service.invoke(method, params),
                        user, clientId: context.clientId })
                    : method === 'render'
                    ? validate.renderResult(await worker.request('render', validate.renderRequest(input)))
                    : AI.has(method) ? await hostedAI.run(method, params, { ...context, user }, service.invoke)
                    : await service.invoke(method, params);
                if (PREVIEW.has(method) && result?.previewId) {
                    if (previews.size > 256)
                        previews.delete(previews.keys().next().value);
                    previews.set(result.previewId, { userId: user.id, clientId: context.clientId, passageId: target,
                        ...(publication ? { publication, publishedRaw: result.raw } : {}), expires: store.now() + 15 * 60000 });
                }
                if (method === 'source_apply')
                    previews.delete(params.previewId);
                await store.audit(user.id, 'operation.' + method, target ?? null, 'succeeded', Math.round(performance.now() - started), 'server',
                    method === 'evidence_save' ? { regionsChanged: result?.regionsChanged === true } : {});
                if (['source_apply', 'source_create', 'reference_approve'].includes(method))
                    sourceChanged();
                return result;
            }
            catch (error) {
                await store.audit(user.id, 'operation.' + method, target ?? null, 'failed', Math.round(performance.now() - started));
                // Engine diagnostics are needed by the editor, but never enter telemetry.
                if (!error.status) {
                    error.status = 422;
                    error.code ||= 'ENGINE_ERROR';
                }
                throw error;
            }
        }
    }
    const submissionReview = require('./submission-review.cjs').createSubmissionReview({ store, getProject: () => project, invoke: invokeNow });
    return {
        reviewSubmission: (action, input, context) => queue.run(context.user.id, async () => {
            if (service.hasWork()) throw fault(409, 'ANALYSIS_ACTIVE', 'Aguarde a conclusão das análises antes de revisar o lote.');
            // Batch review owns an outer metadata transaction. Its nested source
            // and reference operations must not notify browsers before it ends.
            deferSourceChange = true;
            try { return await submissionReview[action](input, context); }
            finally {
                deferSourceChange = false;
                if (deferredSourceChange) { deferredSourceChange = false; sourceChanged(); }
            }
        }),
        get project() { return project; }, hasWork: () => service.hasWork(), dictionary, hasPassage, passage, validateChanges, invoke,
        // PDF bytes do not use the serialized grammar worker queue. Each range
        // still revalidates the authenticated user, project and source binding.
        openPdf: async (params, context) => {
            if (store.db.unavailable) throw fault(503, 'DATABASE_UNAVAILABLE', 'Banco de dados indisponível.');
            await store.assertUser(context.user);
            if (params.projectId !== project.id)
                throw fault(403, 'PROJECT_MISMATCH', 'Projeto inválido.');
            if (!project.sources?.some(s => s.id === params.sourceId) && !project.passages.some(p => p.sourceId === params.sourceId))
                throw fault(400, 'SOURCE_MISSING', 'Fonte desconhecida.');
            try { return await service.openEvidence({ projectId: project.id, sourceId: params.sourceId, assetId: params.assetId }); }
            catch (error) { error.status ||= error.code === 'ENOENT' ? 404 : 422; error.code ||= 'EVIDENCE_ERROR'; throw error; }
        },
        refresh: context => queue.run(context.user.id, async () => { await store.assertUser(context.user); return open(); }),
        upload: (file, params, context) => queue.run(context.user.id, async () => {
            if(store.db.unavailable) throw fault(503, 'DATABASE_UNAVAILABLE', 'Banco de dados indisponível.');
            const user = await store.assertUser(context.user);
            if (user.role === 'contributor' && params.replace === true)
                throw fault(403, 'REVIEWER_REQUIRED', 'Um revisor deve substituir o PDF já vinculado à fonte.');
            const draftId = await evidenceContext(params);
            await store.assertClaim(draftId, user, context.clientId, true);
            pickedFile = file;
            try {
                const result = await service.invoke('evidence_attach', { ...params, projectId: project.id });
                await store.audit(user.id, 'evidence.attach', params.passageId);
                emit({ type: 'evidence-change', projectId: project.id, sourceId: params.sourceId });
                return result;
            }
            catch (error) {
                await store.audit(user.id, 'evidence.attach', params.passageId, 'failed');
                error.status ||= 422;
                error.code ||= 'EVIDENCE_ERROR';
                throw error;
            }
            finally {
                pickedFile = null;
            }
        }),
        close: async () => { await queue.tail.catch(() => { }); await service.close(); worker?.close(); },
    };
}
module.exports = { createStudio, Queue, READ, REVIEW, authorizeMethod };
