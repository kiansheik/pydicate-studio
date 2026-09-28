'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { DraftStore } = require('../electron/draft-store.cjs');
const { fault } = require('./store.cjs');
const READ = new Set(['ai_status','ai_history','ai_prompt_preview','analysis_list','analysis_get']);
const WRITE = new Set(['ai_configure','ai_start','ai_cancel','ai_accept','analysis_submit','analysis_submit_batch',
  'analysis_accept','analysis_cancel','analysis_retry','analysis_resume','analysis_new_conversation',
  'analysis_select_conversation','analysis_composer']);
const METHODS = new Set([...READ,...WRITE]);

// Human acceptance uses the same receipt contract as desktop, inside PostgreSQL's
// transaction and claim checks. No background agent can directly save a human draft.
function createHostedAI({ store, emit = () => {} }) {
  const requests = new AsyncLocalStorage();
  const legacyRequests = new Map();
  const drafts = {
    load: id => store.load(id), writes: new Map(),
    acceptanceReceipt: DraftStore.prototype.acceptanceReceipt,
    acceptCandidate: DraftStore.prototype.acceptCandidate,
    transact: (projectId, update) => store.transaction(async () => {
      const context = requests.getStore();
      if (!context) throw fault(403, 'HUMAN_REQUIRED', 'Aceite a proposta na sua sessão.');
      await store.assertUser(context.user);
      const before = await store.snapshot(projectId);
      const next = await update(structuredClone(before.envelope));
      const changes = Object.entries(next.drafts).filter(([id, draft]) =>
        JSON.stringify(draft) !== JSON.stringify(before.envelope.drafts[id])).map(([id,draft]) =>
        ({id, draft, version:before.versions[id] || 0}));
      await store.patch(projectId, changes, context.user, context.clientId, true);
      return (await store.snapshot(projectId)).envelope;
    }),
  };
  async function authorize(method, params, context, invoke) {
    if (!METHODS.has(method)) throw fault(403, 'HOSTED_UNAVAILABLE', 'Operação indisponível no servidor.');
    if (method === 'ai_configure') {
      if (params.provider !== 'codex') throw fault(400, 'PROVIDER_UNAVAILABLE', 'Este servidor usa Codex.');
      if (context.user.role !== 'admin') {
        const {config} = await invoke('ai_status', {});
        if (params.model !== config.models.codex || (params.reasoningEffort && params.reasoningEffort !== config.reasoningEffort))
          throw fault(403, 'ADMIN_REQUIRED', 'Somente a administração altera o modelo compartilhado.');
      }
      return;
    }
    if (method === 'ai_start' && params.provider !== 'codex')
      throw fault(400, 'PROVIDER_UNAVAILABLE', 'Este servidor usa Codex.');
    if (!WRITE.has(method)) return;
    const items = method === 'analysis_submit_batch' ? params.items : [params];
    if (!Array.isArray(items) || !items.length || items.length > 50)
      throw fault(400, 'INVALID_INPUT', 'Selecione entre uma e cinquenta passagens.');
    for (const item of items) {
      if (!item || typeof item !== 'object') throw fault(400, 'INVALID_INPUT', 'Entrada inválida.');
      let target = item.passageId;
      if (item.jobId) {
        const detail = await invoke('analysis_get', { projectId: params.projectId, jobId:item.jobId });
        const job = detail.job;
        if (!job || (target && target.replace(/^pending:/,'passage:') !== job.passageId.replace(/^pending:/,'passage:')))
          throw fault(400, 'PASSAGE_MISMATCH', 'A análise pertence a outra passagem.');
        target = job.passageId;
      }
      if (method === 'ai_cancel') target = legacyRequests.get(item.requestId)?.passageId;
      if (!target) throw fault(400, 'PASSAGE_REQUIRED', 'Escolha a passagem desta operação.');
      const saved = await store.load(params.projectId);
      if (!saved?.drafts[target] && !saved?.drafts[target.replace(/^passage:/,'pending:')])
        throw fault(404, 'PASSAGE_MISSING', 'Salve a passagem antes de enviar.');
      await store.assertClaim(target, context.user, context.clientId, true);
    }
  }
  async function run(method, params, context, invoke) {
    await authorize(method, params, context, invoke);
    const result = await requests.run(context, () => invoke(method, params));
    if (method === 'ai_start') {
      legacyRequests.set(params.requestId, {passageId:params.passageId});
      if (legacyRequests.size > 256) legacyRequests.delete(legacyRequests.keys().next().value);
    }
    if (method === 'analysis_accept') {
      const snapshot = await store.snapshot(params.projectId);
      result.envelope = snapshot.envelope;
      result.draft = snapshot.envelope.drafts[result.draft.passageId];
      result.versions = snapshot.versions;
      emit({type:'draft-change',projectId:params.projectId,passageId:result.draft.passageId});
    }
    if (method === 'ai_status') result.providers = result.providers.filter(provider => provider.id === 'codex');
    return result;
  }
  return { drafts, run };
}
module.exports = { createHostedAI, METHODS };
