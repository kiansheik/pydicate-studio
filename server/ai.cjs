'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { DraftStore } = require('../runtime/draft-store.cjs');
const { fault } = require('./store.cjs');
const READ = new Set(['ai_status','ai_history','ai_prompt_preview','analysis_list','analysis_get']);
const WRITE = new Set(['ai_configure','ai_start','ai_cancel','ai_accept','analysis_submit','analysis_submit_batch',
  'analysis_accept','analysis_confirm_grammar','analysis_cancel','analysis_retry','analysis_resume','analysis_steer','analysis_new_conversation',
  'analysis_select_conversation','analysis_composer']);
const METHODS = new Set([...READ,...WRITE]);
// Claude API (a server-wide key) stays unavailable here; Claude Code runs under
// each contributor's own subscription and is therefore allowed.
const HOSTED_PROVIDERS = new Set(['codex','claude-code']);

// Browser history needs the observed work, not model replay checkpoints or corpus baselines.
// The complete records and tool receipts remain in AnalysisStore for recovery/export.
function browserJob(job) {
  if (!job?.input) return job;
  const { grammarRepair, diagnostic, ...input } = job.input;
  return { ...job, input,
    attempts: job.attempts?.map(({checkpoint, followUpContext, ...attempt}) => ({...attempt,
      ...(checkpoint ? {checkpoint: {version: checkpoint.version, phase: checkpoint.phase}} : {})})),
    events: job.events?.map(event => {
      const {result, arguments: args, ...small} = event;
      if (result === undefined) return small;
      if (Buffer.byteLength(JSON.stringify(result)) <= 8192) return {...small, result};
      let value = result;
      if (Array.isArray(result?.content)) {
        const text = result.content.find(block => block.type === 'text')?.text;
        if (typeof text === 'string' && text.length <= 8 * 1024 * 1024) {
          try { value = JSON.parse(text); } catch {}
        }
      }
      return {...small, result: {
        isError: Boolean(result?.isError || value?.isError || value?.error),
        rolledBack: Boolean(value?.rolledBack || value?.receipt?.rolledBack),
        summary: 'Resultado completo preservado no histórico do servidor.',
        ...(value?.path ? {path: value.path} : {}),
      }};
    }),
  };
}

// Human acceptance uses the same receipt contract as desktop, inside PostgreSQL's
// transaction and claim checks. No background agent can directly save a human draft.
function createHostedAI({ store, emit = () => {}, claudeStatus = async () => null }) {
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
      if (!HOSTED_PROVIDERS.has(params.provider))
        throw fault(400, 'PROVIDER_UNAVAILABLE', 'Este servidor usa Codex ou Claude Code.');
      // Claude Code bills to the contributor's own subscription, so each person
      // chooses their own model. Only the shared Codex settings are administered.
      if (params.provider === 'codex' && context.user.role !== 'admin') {
        const {config} = await invoke('ai_status', {});
        if (params.model !== config.models.codex || (params.reasoningEffort && params.reasoningEffort !== config.reasoningEffort))
          throw fault(403, 'ADMIN_REQUIRED', 'Somente a administração altera o modelo compartilhado.');
      }
      return;
    }
    if (method === 'ai_start') {
      if (!HOSTED_PROVIDERS.has(params.provider))
        throw fault(400, 'PROVIDER_UNAVAILABLE', 'Este servidor usa Codex ou Claude Code.');
      if (params.provider === 'claude-code') {
        const status = await claudeStatus(context.user);
        if (!status?.loggedIn)
          throw fault(403, 'CLAUDE_SIGNIN_REQUIRED',
            'Entre com a sua própria conta Claude em "Claude Code · minha conta" antes de enviar.');
      }
    }
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
    const result = await requests.run(context, () => invoke(method, method === 'analysis_confirm_grammar' ? {...params, confirmedBy: context.user.id} : params));
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
    if (result?.job) result.job = browserJob(result.job);
    else if (result?.input) return browserJob(result);
    if (method === 'analysis_list') result.background.detail = 'As análises continuam no servidor quando você fecha esta aba. Tentativas interrompidas exigem uma nova tentativa explícita.';
    if (method === 'ai_status') result.providers = result.providers.filter(provider => HOSTED_PROVIDERS.has(provider.id));
    return result;
  }
  // The provider runs inside this context, so a per-contributor credential can
  // be resolved from it without threading a user through every call site.
  const currentUser = () => requests.getStore()?.user || null;
  return { drafts, run, currentUser };
}
module.exports = { createHostedAI, METHODS, HOSTED_PROVIDERS, browserJob };
