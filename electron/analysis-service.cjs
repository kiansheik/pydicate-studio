'use strict';
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AnalysisStore, digest } = require('./analysis-store.cjs');
const { createScratchService } = require('./scratch-service.cjs');
const { createStudioMcpGateway } = require('./studio-mcp-gateway.cjs');
const { createEvidenceImages } = require('./evidence-images.cjs');
const { createExternalAnalysisRunner } = require('./analysis-external.cjs');
const { runAgent, normalizeBudgets } = require('./agent-runner.cjs');
const { createGrammarRepair, REPAIR_TOOLS, REPAIR_STRATEGY } = require('./grammar-repair.cjs');
const validate = require('./validation.cjs');
const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();
const error = (code, message) => Object.assign(new Error(message), { code });
const requireId = (value, label = 'identidade') => {
  validate.id(value, label);
  if (['__proto__', 'constructor', 'prototype'].includes(value))
    throw error('INVALID_ID', 'Identidade reservada.');
  return value;
};
const own = (object, key) => (Object.hasOwn(object, key) ? object[key] : undefined);
const canonicalPassage = (id) => id?.replace(/^pending:/, 'passage:');
const samePassage = (left, right) => canonicalPassage(left) === canonicalPassage(right);
const terminal = new Set(['ready-for-review', 'needs-input', 'blocked', 'failed', 'cancelled']);
function text(value, limit = 100000) {
  if (typeof value !== 'string' || value.length > limit)
    throw error('INVALID_INPUT', 'Texto ausente ou excessivamente grande.');
  return value;
}
function conversation(state, passageId) {
  let entry =
    own(state.conversations, passageId) ??
    Object.values(state.conversations).find(
      (thread) => !thread.archived && samePassage(thread.passageId, passageId),
    );
  if (!entry)
    state.conversations[passageId] = entry = {
      id: 'conversation:' + randomUUID(),
      projectId: state.projectId,
      passageId,
      revision: 0,
      composer: '',
      turns: [],
    };
  return entry;
}
function activateConversation(state, passageId, selected) {
  const previous = conversation(state, passageId);
  if (previous.id === selected?.id) return previous;
  previous.archived = true;
  for (const [key, thread] of Object.entries(state.conversations))
    if (thread.id === previous.id || thread.id === selected?.id) delete state.conversations[key];
  state.conversations[previous.id] = previous;
  if (selected) {
    selected.archived = false;
    state.conversations[passageId] = selected;
  }
  return selected ?? conversation(state, passageId);
}
function createAnalysisService({
  stateDirectory,
  draftStore,
  evidence,
  getConfig,
  getProject,
  request,
  reloadProject,
  emit = () => {},
  runner = runAgent,
  providers,
  store = new AnalysisStore(path.join(stateDirectory, 'records')),
  autoRun = true,
}) {
  if (!draftStore)
    throw new Error('O serviço de análise exige o gravador de rascunhos do aplicativo.');
  const images = createEvidenceImages(path.join(stateDirectory, 'images'));
  const grammar = createGrammarRepair({
    draftStore,
    getProject,
    request,
    reloadProject,
    getConfig,
    stateDirectory: path.join(stateDirectory, 'grammar-edits'),
  });
  const initialized = new Map(),
    locations = new Map(),
    active = new Map(),
    toolCalls = new Map();
  const ownerId = randomUUID();
  let closed = false,
    scheduling = false,
    scheduleAgain = false;
  const currentProject = (projectId) => {
    const project = getProject();
    if (!project || project.id !== projectId || project.mode !== 'local')
      throw error('STALE_PROJECT', 'Abra o projeto local desta análise.');
    return project;
  };
  // Publication changes the UI identity, never the immutable job input or audit trail.
  function present(record) {
    if (!record) return record;
    const project = getProject();
    const published = canonicalPassage(record.passageId);
    return record.projectId === project?.id && project.passages.some((p) => p.id === published)
      ? { ...record, passageId: published }
      : record;
  }
  function notify(job) {
    emit({
      type: 'analysis',
      projectId: job.projectId,
      passageId: present(job).passageId,
      jobId: job.id,
      status: job.status,
      phase: job.phase,
    });
  }
  async function initialize(projectId) {
    if (!initialized.has(projectId))
      initialized.set(
        projectId,
        (async () => {
          const state = await store.read(projectId);
          for (const job of Object.values(state.jobs)) locations.set(job.id, projectId);
          if (
            Object.values(state.jobs).some((job) => ['running', 'cancelling'].includes(job.status))
          ) {
            await store.transact(projectId, (next) => {
              for (const job of Object.values(next.jobs))
                if (['running', 'cancelling'].includes(job.status)) {
                  const cancelling = job.status === 'cancelling';
                  job.status = cancelling ? 'cancelled' : 'blocked';
                  job.phase = 'interrupted';
                  job.updatedAt = now();
                  job.error = {
                    code: 'INTERRUPTED',
                    message:
                      'O aplicativo foi interrompido. A resposta pode ter sido cobrada; revise o trabalho salvo e escolha Tentar novamente explicitamente.',
                  };
                  const attempt = job.attempts.at(-1);
                  if (attempt) {
                    attempt.status = job.status;
                    attempt.finishedAt = now();
                    attempt.error = job.error;
                  }
                  delete job.lease;
                }
            });
          }
        })().catch((reason) => {
          initialized.delete(projectId);
          throw reason;
        }),
      );
    await initialized.get(projectId);
  }
  async function jobById(jobId) {
    const projectId = locations.get(jobId);
    if (!projectId) throw error('JOB_NOT_FOUND', 'Análise não encontrada.');
    const job = own((await store.read(projectId)).jobs, jobId);
    if (!job) throw error('JOB_NOT_FOUND', 'Análise não encontrada.');
    return job;
  }
  function assertFresh(job) {
    const project = currentProject(job.projectId);
    if (!job.input.grammarRepair && project.engineFingerprint !== job.input.engineFingerprint)
      throw error(
        'STALE_ENGINE',
        'O corpus ou a gramática mudou. A proposta foi preservada; envie uma nova análise com a versão atual.',
      );
    const passage = project.passages.find((p) => samePassage(p.id, job.passageId));
    if (
      passage &&
      (passage.sourceId !== job.input.sourceId ||
        passage.sourceFingerprint !== job.input.sourceFingerprint)
    )
      throw error(
        'STALE_SOURCE',
        'A fonte mudou depois do envio. Compare a proposta e envie uma nova análise.',
      );
    if (!passage && !job.passageId.startsWith('pending:'))
      throw error('STALE_SOURCE', 'A passagem não existe mais na fonte selecionada.');
    return project;
  }
  async function mutateJob(jobId, update, { attemptId, allowTerminal = false } = {}) {
    const projectId = locations.get(jobId);
    const result = await store.transact(projectId, (state) => {
      const job = own(state.jobs, jobId);
      if (!job) throw error('JOB_NOT_FOUND', 'Análise não encontrada.');
      if (
        attemptId &&
        (job.lease?.ownerId !== ownerId ||
          job.lease?.attemptId !== attemptId ||
          (!allowTerminal && job.status !== 'running'))
      )
        throw error(
          'STALE_ATTEMPT',
          'Esta tentativa foi encerrada; resultados tardios foram ignorados.',
        );
      const result = update(job, state);
      job.updatedAt = now();
      return result ?? job;
    });
    const job = result?.input ? result : await jobById(jobId);
    notify(job);
    return result;
  }
  async function candidateById(jobId, id) {
    const job = await jobById(jobId),
      state = await store.read(job.projectId),
      candidate = own(state.candidates, id);
    return candidate?.jobId === jobId ? candidate : null;
  }
  const scratch = createScratchService({
    getJob: jobById,
    getCandidate: candidateById,
    getProject,
    request,
    saveCandidate: async (jobId, next, { expectedRevision, operationId }) => {
      const running = active.get(jobId);
      if (!running) throw error('STALE_ATTEMPT', 'A tentativa não está ativa.');
      return mutateJob(
        jobId,
        (job, state) => {
          assertFresh(job);
          const previous = own(state.candidates, next.id);
          const key = 'candidate:' + running.attemptId + ':' + operationId;
          const signature = digest({ next, expectedRevision });
          const repeated = own(state.operations, key);
          if (repeated) {
            if (repeated.digest !== signature)
              throw error('OPERATION_CONFLICT', 'Esta operação já foi usada com outro conteúdo.');
            return repeated.result;
          }
          if ((previous?.revisionId ?? null) !== expectedRevision)
            throw error('STALE_CANDIDATE', 'A proposta mudou; inspecione a revisão atual.');
          if (
            next.projectId !== job.projectId ||
            next.passageId !== job.passageId ||
            next.jobId !== jobId
          )
            throw error('INVALID_CANDIDATE', 'A proposta pertence a outra análise.');
          if (!previous && job.candidateIds.length >= 12)
            throw error('CANDIDATE_LIMIT', 'Limite de doze alternativas por análise.');
          state.candidates[next.id] = clone(next);
          state.candidateRevisions[next.id] ??= [];
          state.candidateRevisions[next.id].push(clone(next));
          if (!previous) job.candidateIds.push(next.id);
          state.operations[key] = { digest: signature, result: clone(next) };
          return next;
        },
        { attemptId: running.attemptId },
      );
    },
    getEvidence: async (jobId, params) => {
      const job = await jobById(jobId);
      assertFresh(job);
      const captured = job.input.evidence;
      const regions = params.regionId
        ? captured.regions.filter((r) => r.id === params.regionId)
        : captured.regions;
      if (params.regionId && !regions.length)
        throw error('EVIDENCE_NOT_FOUND', 'A região não pertence à entrada salva desta análise.');
      const metadata = {
        ...captured,
        regions,
        images: captured.images.filter((image) => regions.some((r) => r.id === image.regionId)),
      };
      if (!params.pixels) return metadata;
      if (!job.input.includeImages)
        throw error(
          'IMAGES_NOT_SELECTED',
          'Esta análise foi enviada apenas com texto. Peça ao contribuinte para selecionar Enviar imagens e reenviar.',
        );
      if (metadata.images.length !== regions.length || !regions.length)
        throw error('EVIDENCE_NOT_FOUND', 'Não há pixels salvos destas regiões.');
      return {
        content: [
          { type: 'text', text: JSON.stringify(metadata) },
          ...(await Promise.all(metadata.images.map((image) => images.read(image)))),
        ],
        structuredContent: metadata,
      };
    },
    askQuestion: async (jobId, question) => {
      const running = active.get(jobId);
      if (!running) throw error('STALE_ATTEMPT', 'Tentativa encerrada.');
      return mutateJob(
        jobId,
        (job) => {
          if (job.questions.length >= 30)
            throw error('QUESTION_LIMIT', 'Limite de perguntas atingido.');
          const item = { ...question, text: question.question, id: randomUUID(), at: now() };
          job.questions.push(item);
          return item;
        },
        { attemptId: running.attemptId },
      );
    },
    recordTool: async (jobId, event) => {
      const running = active.get(jobId);
      if (!running) return;
      await mutateJob(
        jobId,
        (job) => {
          job.events ??= [];
          job.events.push({ ...event, at: now() });
          job.phase = event.tool ?? event.name ?? event.phase ?? 'tool';
        },
        { attemptId: running.attemptId },
      );
    },
  });
  async function isJobActive(jobId, attemptId) {
    if (closed) return false;
    const handle = active.get(jobId);
    if (!handle || handle.attemptId !== attemptId || handle.controller.signal.aborted) return false;
    const job = await jobById(jobId);
    return (
      job.status === 'running' &&
      job.lease?.ownerId === ownerId &&
      job.lease.attemptId === attemptId
    );
  }
  async function callTool(jobId, name, args, options = {}) {
    const handle = active.get(jobId),
      attemptId = options.attemptId ?? handle?.attemptId;
    if (!(await isJobActive(jobId, attemptId)))
      throw error('STALE_ATTEMPT', 'A tentativa foi encerrada.');
    requireId(options.operationId, 'operação');
    const job = await jobById(jobId);
    assertFresh(job);
    const key = 'tool:' + attemptId + ':' + options.operationId,
      signature = digest({ name, args });
    const state = await store.read(job.projectId),
      prior = own(state.operations, key);
    if (prior) {
      if (prior.digest !== signature)
        throw error('OPERATION_CONFLICT', 'A chamada repetida mudou de argumentos.');
      if (prior.error) throw error(prior.error.code, prior.error.message);
      return prior.result;
    }
    if (toolCalls.has(key)) {
      const existing = toolCalls.get(key);
      if (existing.digest !== signature)
        throw error('OPERATION_CONFLICT', 'A chamada repetida mudou de argumentos.');
      return existing.promise;
    }
    const promise = (async () => {
      await mutateJob(
        jobId,
        (value) => {
          const attempt = value.attempts.at(-1);
          attempt.steps = (attempt.steps ?? 0) + 1;
          if (attempt.steps > value.input.budgets.maxSteps)
            throw error('STEP_LIMIT', 'Limite de consultas e edições desta tentativa atingido.');
        },
        { attemptId },
      );
      let result, caught;
      try {
        const toolOptions = {
          ...options,
          signal: options.signal
            ? AbortSignal.any([handle.controller.signal, options.signal])
            : handle.controller.signal,
          operationId: key,
        };
        result = job.input.grammarRepair
          ? await grammar.call(job, name, args, toolOptions)
          : await scratch.call(jobId, name, args, toolOptions);
        if (job.input.grammarRepair)
          await mutateJob(
            jobId,
            (value) => {
              if (result.receipt) {
                value.grammarEdits ??= [];
                value.grammarEdits.push(result.receipt);
              }
              if (result.verification || name === 'reload_engine')
                value.grammarVerification = result.verification ?? result;
              value.events.push({ type: 'tool-result', tool: name, at: now(), result });
            },
            { attemptId },
          );
      } catch (reason) {
        caught = reason;
      }
      if (!(await isJobActive(jobId, attemptId)))
        throw error('STALE_ATTEMPT', 'A tentativa foi encerrada; o resultado tardio foi ignorado.');
      await mutateJob(
        jobId,
        (_job, next) => {
          next.operations[key] = {
            digest: signature,
            ...(caught
              ? { error: { code: caught.code ?? 'TOOL_ERROR', message: caught.message } }
              : { result }),
          };
        },
        { attemptId },
      );
      if (caught) throw caught;
      return result;
    })();
    toolCalls.set(key, { digest: signature, promise });
    try {
      return await promise;
    } finally {
      toolCalls.delete(key);
    }
  }
  const gateway = createStudioMcpGateway({
    stateDirectory: path.join(stateDirectory, 'mcp'),
    callTool,
    listTools: async (jobId) =>
      (await jobById(jobId)).input.grammarRepair ? REPAIR_TOOLS : scratch.tools,
    getGuide: async (jobId) =>
      (await jobById(jobId)).input.grammarRepair ? REPAIR_STRATEGY : scratch.getGuide(),
    isJobActive,
  });
  const externalRunner = createExternalAnalysisRunner({
    getJob: jobById,
    getCandidates: async (jobId) => {
      const job = await jobById(jobId);
      const state = await store.read(job.projectId);
      return job.candidateIds.map((id) => state.candidates[id]);
    },
  });
  async function capture(params) {
    const project = currentProject(params.projectId);
    const envelope = await draftStore.load(project.id),
      draft = own(envelope?.drafts ?? {}, params.passageId);
    if (!draft || draft.revisionId !== params.revisionId)
      throw error('DRAFT_CONFLICT', 'Salve a revisão atual antes de enviar a análise.');
    const passage = project.passages.find((p) => p.id === params.passageId),
      sourceId = passage?.sourceId ?? draft.pending?.sourceId;
    if (sourceId !== 'araujo_catecismo_1686')
      throw error('SOURCE_UNSUPPORTED', 'Este fluxo está disponível para o Catecismo de Araújo.');
    if (passage && draft.sourceFingerprint !== passage.sourceFingerprint)
      throw error('STALE_SOURCE', 'Reconcilie o rascunho com a fonte antes de analisar.');
    if (!passage && !draft.pending) throw error('PASSAGE_NOT_FOUND', 'Passagem não encontrada.');
    if (
      !['analyze', 'translate-source', 'translate-analysis', 'explain', 'revise'].includes(
        params.task,
      )
    )
      throw error('INVALID_TASK', 'Tarefa de análise inválida.');
    if (!['passage', 'constituent'].includes(params.scope))
      throw error('INVALID_SCOPE', 'Escolha passagem inteira ou constituinte.');
    const scopeContext = {
      projectId: project.id,
      passageId: draft.passageId,
      sourceId,
      engineFingerprint: project.engineFingerprint,
    };
    const parsed =
      params.scope === 'constituent'
        ? await request('parse_expression', {
            ...scopeContext,
            raw: draft.raw ?? '',
            revisionId: draft.revisionId,
          })
        : null;
    let selectedNode;
    if (parsed) {
      const flatten = (node) =>
        node ? [node, ...(node.children ?? []).flatMap((child) => flatten(child.node))] : [];
      const wanted = params.selectedNode;
      const node = flatten(parsed.root).find(
        (n) => n.id === (typeof wanted === 'string' ? wanted : (wanted?.id ?? wanted?.nodeId)),
      );
      if (
        !node ||
        !Number.isInteger(node.start) ||
        !Number.isInteger(node.end) ||
        typeof wanted !== 'object' ||
        wanted.code !== node.code ||
        wanted.start !== node.start ||
        wanted.end !== node.end
      )
        throw error('STALE_NODE', 'Selecione novamente o constituinte na revisão atual.');
      selectedNode = {
        id: node.id,
        start: node.start,
        end: node.end,
        raw: node.code ?? (draft.raw ?? '').slice(node.start, node.end),
        revisionId: draft.revisionId,
      };
    }
    const evidenceParams = {
      projectId: project.id,
      sourceId,
      passageId: draft.passageId.replace(/^pending:/, 'passage:'),
    };
    const saved = await evidence.invoke('evidence_status', evidenceParams);
    if (params.evidenceRevision !== undefined && saved.revision !== params.evidenceRevision)
      throw error(
        'EVIDENCE_CONFLICT',
        'A evidência mudou durante o envio. Confira as regiões e tente novamente.',
      );
    const ownRegions = (saved.passage?.regions ?? []).filter((r) => r.assetId === saved.asset?.id);
    if (!draft.diplomatic.trim() && !draft.aiInput?.tentativeReading?.trim() && !ownRegions.length)
      throw error(
        'EMPTY_INPUT',
        'Digite a transcrição ou salve uma região própria desta passagem.',
      );
    let capturedImages = [];
    if (params.includeImages) {
      if (!ownRegions.length || saved.asset?.managedState !== 'ok')
        throw error(
          'EVIDENCE_UNAVAILABLE',
          'Salve uma região do PDF disponível antes de enviar imagens.',
        );
      const bytes = await evidence.invoke('evidence_bytes', {
        ...evidenceParams,
        assetId: saved.asset.id,
      });
      capturedImages = await images.capture(bytes, ownRegions, saved.passage?.view?.rotation ?? 0);
    }
    let evaluation;
    if (params.task === 'translate-analysis') {
      evaluation = await request('evaluate_expression', {
        ...scopeContext,
        raw: params.scope === 'constituent' ? selectedNode.raw : (draft.raw ?? ''),
        revisionId: draft.revisionId,
      });
      if (evaluation.evaluationStatus === 'partial' || !evaluation.surface)
        throw error(
          'INCOMPLETE_EVALUATION',
          'Conclua a análise antes de traduzi-la. Para interpretar a fonte, use Interpretar a fonte.',
        );
    }
    const dictionary = await request('dictionary_lookup', {
      ...scopeContext,
      query: 'a',
      limit: 1,
    });
    const config = await getConfig();
    const state = await store.read(project.id),
      previous = conversation(state, draft.passageId);
    let feedback;
    if (params.parentJobId) {
      const parent = own(state.jobs, params.parentJobId);
      if (!parent || !samePassage(parent.passageId, draft.passageId))
        throw error('INVALID_FEEDBACK', 'A conversa anterior pertence a outra passagem.');
      feedback = { jobId: parent.id, questions: parent.questions };
      if (params.candidateId) {
        const candidate = own(state.candidates, params.candidateId);
        if (
          !candidate ||
          candidate.jobId !== parent.id ||
          candidate.revisionId !== params.candidateRevision
        )
          throw error(
            'STALE_CANDIDATE',
            'A proposta comentada mudou. Selecione sua revisão atual.',
          );
        feedback.candidate = clone(candidate);
        if (params.feedbackNode) {
          const flatten = (node) =>
            node ? [node, ...(node.children ?? []).flatMap((child) => flatten(child.node))] : [];
          if (
            params.feedbackNode.candidateId !== candidate.id ||
            params.feedbackNode.candidateRevision !== candidate.revisionId ||
            !flatten(candidate.tree).some((n) => n.id === params.feedbackNode.nodeId)
          )
            throw error('STALE_NODE', 'O comentário aponta para uma versão anterior do nó.');
          feedback.node = clone(params.feedbackNode);
        }
      } else if (params.feedbackNode)
        throw error('INVALID_FEEDBACK', 'Selecione uma proposta antes de comentar um nó.');
    } else if (params.candidateId || params.feedbackNode)
      throw error('INVALID_FEEDBACK', 'A revisão precisa da análise anterior.');
    const preceding = project.passages
      .filter(
        (p) =>
          p.sourceId === sourceId &&
          p.ordinal < (passage?.ordinal ?? draft.pending.ordinal) &&
          p.acceptedReference !== null,
      )
      .slice(-3);
    const packet = {
      version: 1,
      id: 'input:' + randomUUID(),
      projectId: project.id,
      sourceId,
      passageId: draft.passageId,
      baseRevisionId: draft.revisionId,
      sourceFingerprint: draft.sourceFingerprint,
      engineFingerprint: project.engineFingerprint,
      repositories: clone(project.repositories),
      diplomatic: draft.diplomatic,
      tentativeReading: draft.aiInput?.tentativeReading ?? '',
      meaning: draft.aiInput?.meaning ?? '',
      constraints: draft.aiInput?.constraints ?? '',
      notes: draft.notes,
      reviewedTarget: draft.normalized,
      raw: draft.raw ?? '',
      canvas: draft.canvas ?? { fragments: [], positions: {}, layout: 'bottom-up' },
      locators: { ...passage?.witness, ...draft.locators },
      evidence: {
        revision: saved.revision,
        assetId: saved.asset?.id,
        assetHash: saved.asset?.fingerprint,
        regions: ownRegions,
        images: capturedImages,
        view: saved.passage?.view,
        imagesSelected: Boolean(params.includeImages),
      },
      context: preceding.map((p) => ({
        id: p.id,
        sourceId: p.sourceId,
        ordinal: p.ordinal,
        diplomatic: p.diplomatic,
        surface: p.acceptedReference,
        sourceFingerprint: p.sourceFingerprint,
        reviewStatus: 'legacy-surface-only',
        note: 'A referência preservada é uma superfície. Ela não certifica a expressão atual nem suas anotações; a expressão não foi incluída no contexto revisto.',
        provenance: p.referenceProvenance,
      })),
      manifest: {
        version: 1,
        mode: 'assisted',
        allowedSourceIds: [sourceId, 'lexicon'],
        excludePassageIds: [],
        excludeConstructionIds: [],
        excludeLexicalNames: [],
        dictionary: { dataset: 'navarro-website', fingerprint: dictionary.datasetFingerprint },
        maxContextPassages: 3,
        maxSearchPage: 40,
        contextPolicy: 'preserved-ground-truth-only; no queued hypotheses',
      },
      task: params.task,
      scope: params.scope,
      ...(selectedNode ? { selectedNode } : {}),
      ...(evaluation ? { evaluation } : {}),
      ...(feedback ? { feedback } : {}),
      conversation: previous.turns.slice(-12),
      description: text(params.description ?? '', 10000),
      provider: config.provider,
      model: config.models[config.provider],
      reasoningEffort: config.reasoningEffort,
      budgets: normalizeBudgets(params.budgets),
      includeImages: Boolean(params.includeImages),
      createdAt: now(),
    };
    // No save or namespace change may slip between evidence capture and commit.
    if (
      (await draftStore.load(project.id))?.drafts[draft.passageId]?.revisionId !== draft.revisionId
    )
      throw error(
        'DRAFT_CONFLICT',
        'Você editou a entrada durante o envio. Tente novamente com o texto atual.',
      );
    if ((await evidence.invoke('evidence_status', evidenceParams)).revision !== saved.revision)
      throw error(
        'EVIDENCE_CONFLICT',
        'A evidência mudou durante o envio; nenhuma análise foi criada.',
      );
    if (getProject()?.engineFingerprint !== project.engineFingerprint)
      throw error('STALE_ENGINE', 'O projeto mudou durante o envio.');
    return { ...packet, digest: digest(packet) };
  }
  async function submit(params, execution = 'provider') {
    requireId(params.operationId, 'operação');
    requireId(params.passageId, 'passagem');
    requireId(params.revisionId, 'revisão');
    const commandKey = 'submit:' + params.operationId,
      signature = digest({ params, execution });
    const prior = own((await store.read(params.projectId)).operations, commandKey);
    if (prior) {
      if (prior.digest !== signature)
        throw error('OPERATION_CONFLICT', 'Este envio já pertence a outra entrada.');
      return jobById(prior.jobId);
    }
    const existingState = await store.read(params.projectId);
    const parent = params.parentJobId ? own(existingState.jobs, params.parentJobId) : null;
    if (
      params.task === 'grammar-repair' &&
      params.parentJobId &&
      (!parent?.input.grammarRepair || !samePassage(parent.passageId, params.passageId))
    )
      throw error('INVALID_FEEDBACK', 'A correção anterior pertence a outra conversa.');
    const input =
      params.task === 'grammar-repair'
        ? await grammar.capture(params, parent)
        : await capture(params);
    if (input.grammarRepair) {
      input.budgets = normalizeBudgets(params.budgets);
      input.conversation = parent
        ? clone(
            Object.values(existingState.conversations)
              .find((thread) => thread.id === parent.conversationId)
              ?.turns.slice(-12) ?? [],
          )
        : [];
      input.digest = digest(input);
    } else if (params.newConversation) {
      input.conversation = [];
      input.digest = digest(input);
    }
    const job = await store.transact(params.projectId, (state) => {
      const repeated = own(state.operations, commandKey);
      if (repeated) {
        if (repeated.digest !== signature)
          throw error('OPERATION_CONFLICT', 'Este envio já pertence a outra entrada.');
        return state.jobs[repeated.jobId];
      }
      if (Object.values(state.jobs).filter((j) => !terminal.has(j.status)).length >= 100)
        throw error('QUEUE_LIMIT', 'Limite de cem análises pendentes atingido.');
      const selectedThread = parent?.input.grammarRepair
        ? Object.values(state.conversations).find((thread) => thread.id === parent.conversationId)
        : null;
      const thread = selectedThread
          ? activateConversation(state, params.passageId, selectedThread)
          : input.grammarRepair || params.newConversation
            ? activateConversation(state, params.passageId)
            : conversation(state, params.passageId),
        id = 'job:' + randomUUID();
      const job = {
        id,
        execution,
        projectId: params.projectId,
        passageId: params.passageId,
        conversationId: thread.id,
        input,
        status: 'queued',
        phase: 'queued',
        attempts: [],
        createdAt: now(),
        updatedAt: now(),
        candidateIds: [],
        questions: [],
        events: [],
        ...(params.parentJobId ? { parentJobId: params.parentJobId } : {}),
      };
      state.jobs[id] = job;
      state.operations[commandKey] = { digest: signature, jobId: id };
      thread.turns.push({
        id: randomUUID(),
        role: 'user',
        text: input.description || input.task,
        jobId: id,
        inputRevisionId: input.baseRevisionId,
        at: now(),
      });
      thread.revision++;
      return job;
    });
    locations.set(job.id, job.projectId);
    notify(job);
    kick();
    return job;
  }
  async function execute(jobId) {
    const controller = new AbortController(),
      attemptId = 'attempt:' + randomUUID();
    const handle = {
      controller,
      attemptId,
      promise: null,
      scope: null,
      conversationId: null,
      enginePath: null,
    };
    active.set(jobId, handle);
    let job;
    try {
      job = await mutateJob(jobId, (value) => {
        if (value.status !== 'queued') throw error('STALE_ATTEMPT', 'A análise saiu da fila.');
        assertFresh(value);
        value.status = 'running';
        value.phase = 'input';
        delete value.error;
        value.lease = { ownerId, attemptId, startedAt: now() };
        value.attempts.push({ id: attemptId, status: 'running', startedAt: now(), steps: 0 });
      });
      handle.conversationId = job.conversationId;
      handle.enginePath = job.input.grammarRepair?.enginePath;
      const previousState = await store.read(job.projectId);
      const externalBaseline = {
        questionIds: job.questions.map((question) => question.id),
        candidates: job.candidateIds.map((id) => {
          const { revisionId, status, updatedAt } = previousState.candidates[id];
          return { id, revisionId, status, updatedAt };
        }),
      };
      handle.scope = await gateway.openScope({
        jobId,
        attemptId,
        expiresInMs: job.input.budgets.timeoutMs + 10000,
      });
      // A retry is explicit and may bill again. Reconstruct observable completed
      // work instead of blindly replaying a possibly in-flight provider/tool call.
      const priorWork =
        job.attempts.length > 1
          ? {
              warning:
                'Tentativa anterior interrompida ou falhou. Consulte as propostas salvas antes de repetir trabalho; não há garantia de cobrança única.',
              candidates: job.candidateIds
                .map((id) => previousState.candidates[id])
                .map((candidate) => ({
                  id: candidate.id,
                  revisionId: candidate.revisionId,
                  raw: candidate.raw,
                  status: candidate.status,
                  evidence: candidate.evidence,
                  failures: candidate.failures,
                  rationale: candidate.rationale,
                  translation: candidate.translation,
                })),
              lastCheckpoint: job.attempts.at(-2)?.checkpoint?.phase,
              previousError: job.attempts.at(-2)?.error,
            }
          : null;
      const result = await (job.execution === 'external' ? externalRunner : runner)({
        provider: job.input.provider,
        providers,
        workingDirectory: stateDirectory,
        model: job.input.model,
        reasoningEffort: job.input.reasoningEffort,
        input: job.input,
        grammarRepair: Boolean(job.input.grammarRepair),
        externalBaseline,
        ...(priorWork ? { messages: [{ role: 'user', content: JSON.stringify(priorWork) }] } : {}),
        images: await Promise.all(job.input.evidence.images.map((image) => images.read(image))),
        tools: job.input.grammarRepair ? REPAIR_TOOLS : scratch.tools,
        callTool: (name, args, opts) => callTool(jobId, name, args, { ...opts, attemptId }),
        mcp: handle.scope,
        signal: controller.signal,
        budgets: job.input.budgets,
        onEvent: async (event) => {
          await mutateJob(
            jobId,
            (value) => {
              value.events.push({ ...event, at: now() });
              value.phase = event.tool ?? event.phase ?? event.type ?? 'working';
            },
            { attemptId },
          );
        },
        onCheckpoint: async (checkpoint) => {
          await mutateJob(
            jobId,
            (value) => {
              value.attempts.at(-1).checkpoint = checkpoint;
            },
            { attemptId },
          );
        },
      });
      if (controller.signal.aborted) throw controller.signal.reason;
      if (job.input.grammarRepair) {
        // Always verify after the provider stops, even if it forgot its final check.
        try {
          const verification = await grammar.check(job);
          await mutateJob(
            jobId,
            (value) => {
              value.grammarVerification = verification;
            },
            { attemptId },
          );
        } catch (reason) {
          await mutateJob(
            jobId,
            (value) => {
              value.grammarVerification = { error: String(reason.message ?? reason) };
            },
            { attemptId },
          );
        }
      }
      await mutateJob(
        jobId,
        (value, state) => {
          value.summary = String(result.text ?? result.summary ?? '');
          value.usage = result.usage ?? {};
          value.status = value.input.grammarRepair
            ? value.grammarVerification?.matches
              ? 'ready-for-review'
              : 'needs-input'
            : value.candidateIds.some((id) => state.candidates[id]?.status === 'proposed')
              ? 'ready-for-review'
              : value.questions.length
                ? 'needs-input'
                : value.input.task === 'translate-source' ||
                    value.input.task === 'translate-analysis' ||
                    value.input.task === 'explain'
                  ? 'ready-for-review'
                  : 'needs-input';
          if (value.status === 'needs-input' && !value.questions.length)
            value.questions.push({
              text: value.input.grammarRepair
                ? 'A forma ainda precisa de revisão. Confira o resultado e acrescente uma orientação para continuar.'
                : 'A tentativa não produziu uma proposta avaliada. Revise a resposta e acrescente uma orientação para continuar.',
            });
          value.phase = value.status;
          const attempt = value.attempts.at(-1);
          attempt.status = value.status;
          attempt.finishedAt = now();
          attempt.usage = value.usage;
          attempt.checkpoint = result.checkpoint ?? attempt.checkpoint;
          const thread =
            Object.values(state.conversations).find(
              (thread) => thread.id === value.conversationId,
            ) ?? conversation(state, value.passageId);
          thread.turns.push({
            id: randomUUID(),
            role: 'assistant',
            text: value.summary,
            jobId: value.id,
            inputRevisionId: value.input.baseRevisionId,
            at: now(),
          });
          thread.revision++;
        },
        { attemptId },
      );
    } catch (reason) {
      const current = await jobById(jobId).catch(() => null);
      if (current && !terminal.has(current.status))
        await mutateJob(jobId, (value) => {
          const cancelled =
            controller.signal.aborted && controller.signal.reason?.code === 'CANCELLED';
          value.status = cancelled
            ? 'cancelled'
            : /AUTH|BILL|UNAVAILABLE|STALE|CONFLICT|INTERRUPTED|DEADLINE|TIMEOUT|LIMIT/.test(
                  reason?.code ?? '',
                )
              ? 'blocked'
              : 'failed';
          value.phase = value.status;
          value.error = {
            code: reason?.code ?? 'PROVIDER_ERROR',
            message: String(reason?.message ?? reason),
          };
          const attempt = value.attempts.at(-1);
          if (attempt?.id === attemptId) {
            attempt.status = value.status;
            attempt.finishedAt = now();
            attempt.error = value.error;
          }
        });
    } finally {
      await handle.scope?.close();
      active.delete(jobId);
      kick();
    }
  }
  function kick() {
    if (autoRun && !closed) queueMicrotask(() => schedule().catch(() => {}));
  }
  async function schedule() {
    if (closed || !autoRun) return;
    if (scheduling) {
      scheduleAgain = true;
      return;
    }
    scheduling = true;
    try {
      const project = getProject();
      if (!project || project.mode !== 'local') return;
      await initialize(project.id);
      const state = await store.read(project.id);
      const runningThreads = new Set(
        [...active.keys()].map((id) => state.jobs[id]?.conversationId),
      );
      const runningEngines = new Set(
        [...active.keys()]
          .map((id) => state.jobs[id]?.input.grammarRepair?.enginePath)
          .filter(Boolean),
      );
      for (const job of Object.values(state.jobs).filter((j) => j.status === 'queued')) {
        if (active.size >= 3) break;
        if (
          runningThreads.has(job.conversationId) ||
          (job.input.grammarRepair && runningEngines.has(job.input.grammarRepair.enginePath))
        )
          continue;
        runningThreads.add(job.conversationId);
        if (job.input.grammarRepair) runningEngines.add(job.input.grammarRepair.enginePath);
        const promise = execute(job.id);
        const handle = active.get(job.id);
        if (handle) handle.promise = promise;
        void promise.catch(() => {});
      }
    } finally {
      scheduling = false;
      if (scheduleAgain) {
        scheduleAgain = false;
        kick();
      }
    }
  }
  async function invoke(method, params = {}) {
    currentProject(params.projectId);
    await initialize(params.projectId);
    if (method === 'analysis_submit') return submit(params);
    if (method === 'analysis_external_start') {
      const draft = (await draftStore.load(params.projectId))?.drafts[params.passageId];
      if (!draft)
        throw error('DRAFT_NOT_FOUND', 'Salve a passagem no Studio antes de abrir uma sessão MCP.');
      const job = await submit(
        {
          ...params,
          revisionId: draft.revisionId,
          operationId: params.operationId ?? randomUUID(),
          task: params.task ?? 'analyze',
          scope: 'passage',
          includeImages: false,
        },
        'external',
      );
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline && !closed) {
        const scope = active.get(job.id)?.scope;
        if (scope)
          return { jobId: job.id, configPath: scope.configPath, expiresAt: scope.expiresAt };
        const current = await jobById(job.id);
        if (terminal.has(current.status))
          throw error(
            current.error?.code ?? 'EXTERNAL_FAILED',
            current.error?.message ?? 'Não foi possível iniciar a sessão MCP.',
          );
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw error(
        'QUEUE_WAIT',
        `A sessão ${job.id} permanece na fila. Consulte o Studio antes de iniciar outra sessão.`,
      );
    }
    if (method === 'analysis_submit_batch') {
      if (!Array.isArray(params.items) || !params.items.length || params.items.length > 50)
        throw error('BATCH_LIMIT', 'Selecione entre uma e cinquenta passagens.');
      const jobs = [],
        errors = [];
      for (const item of params.items) {
        try {
          jobs.push(await submit({ ...item, projectId: params.projectId }));
        } catch (reason) {
          errors.push({ passageId: item.passageId, message: reason.message, code: reason.code });
        }
      }
      return { jobs, errors };
    }
    if (method === 'analysis_list') {
      const state = await store.read(params.projectId);
      kick();
      const jobs = Object.values(state.jobs).filter(
        (job) => !params.passageId || samePassage(job.passageId, params.passageId),
      );
      return {
        version: 1,
        jobs: jobs.map(({ attempts, input, events, ...job }) => ({
          ...present(job),
          input: {
            ...Object.fromEntries(
              [
                'baseRevisionId',
                'engineFingerprint',
                'diplomatic',
                'tentativeReading',
                'meaning',
                'reviewedTarget',
                'task',
                'description',
                'scope',
                'provider',
                'model',
                'createdAt',
              ].map((key) => [key, input[key]]),
            ),
            evidence: {
              revision: input.evidence.revision,
              assetId: input.evidence.assetId,
              regionCount: input.evidence.regions.length,
              imageCount: input.evidence.images.length,
              imagesSelected: input.evidence.imagesSelected,
              detailLoaded: false,
            },
          },
          attemptCount: attempts.length,
          events: (events ?? []).slice(-20).map(({ result, arguments: arguments_, ...event }) => ({
            ...event,
            text: event.text?.slice(0, 1000),
          })),
        })),
        conversations: Object.values(state.conversations)
          .filter((thread) => !thread.archived)
          .filter((thread) => !params.passageId || samePassage(thread.passageId, params.passageId))
          .map((thread) => ({ ...present(thread), turns: [] })),
        candidates: [],
        background: {
          running: active.size > 0,
          detail:
            'As análises continuam com a janela fechada enquanto o Studio estiver aberto. Ao encerrar o aplicativo ou suspender o computador, tentativas interrompidas exigem revisão e nova tentativa explícita.',
        },
      };
    }
    if (method === 'analysis_new_conversation') {
      requireId(params.passageId, 'passagem');
      requireId(params.operationId, 'operação');
      return store.transact(params.projectId, (state) => {
        const key = 'conversation:' + params.operationId;
        const prior = own(state.operations, key);
        if (prior) {
          if (!samePassage(prior.passageId, params.passageId))
            throw error('OPERATION_CONFLICT', 'Operação de outra passagem.');
          return present(
            Object.values(state.conversations).find((thread) => thread.id === prior.conversationId),
          );
        }
        const next = activateConversation(state, params.passageId);
        state.operations[key] = { passageId: params.passageId, conversationId: next.id };
        return present(next);
      });
    }
    if (method === 'analysis_select_conversation') {
      requireId(params.passageId, 'passagem');
      requireId(params.conversationId, 'conversa');
      return store.transact(params.projectId, (state) => {
        const selected = Object.values(state.conversations).find(
          (thread) => thread.id === params.conversationId,
        );
        if (!selected || !samePassage(selected.passageId, params.passageId))
          throw error('CONVERSATION_NOT_FOUND', 'Conversa não encontrada nesta passagem.');
        return present(activateConversation(state, params.passageId, selected));
      });
    }
    if (method === 'analysis_composer') {
      requireId(params.passageId, 'passagem');
      return store.transact(params.projectId, (state) => {
        const thread = params.conversationId
          ? Object.values(state.conversations).find(
              (item) =>
                item.id === params.conversationId && samePassage(item.passageId, params.passageId),
            )
          : conversation(state, params.passageId);
        if (!thread) throw error('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
        if (params.expectedRevision !== undefined && params.expectedRevision !== thread.revision)
          throw error(
            'CONVERSATION_CONFLICT',
            'A conversa mudou. Seu texto continua no campo; recarregue a conversa antes de enviar.',
          );
        if (params.text !== undefined) thread.composer = text(params.text, 10000);
        if (params.selectedCandidateId !== undefined) {
          const selected = params.selectedCandidateId
            ? own(state.candidates, params.selectedCandidateId)
            : null;
          if (
            params.selectedCandidateId &&
            (!selected || !samePassage(selected.passageId, params.passageId))
          )
            throw error('CANDIDATE_NOT_FOUND', 'Proposta não encontrada nesta passagem.');
          thread.selectedCandidateId = params.selectedCandidateId;
        }
        if (params.scrollTop !== undefined) {
          if (
            !Number.isFinite(params.scrollTop) ||
            params.scrollTop < 0 ||
            params.scrollTop > 10000000
          )
            throw error('INVALID_INPUT', 'Posição da conversa inválida.');
          thread.scrollTop = params.scrollTop;
        }
        thread.revision++;
        return present(thread);
      });
    }
    requireId(params.jobId, 'análise');
    const job = await jobById(params.jobId);
    if (job.projectId !== params.projectId)
      throw error('JOB_NOT_FOUND', 'Análise não encontrada neste projeto.');
    if (method === 'analysis_get') {
      const state = await store.read(params.projectId);
      return {
        job: present(job),
        conversation: present(
          Object.values(state.conversations).find((thread) => thread.id === job.conversationId),
        ),
        candidates: job.candidateIds.map((id) => present(state.candidates[id])),
      };
    }
    if (method === 'analysis_accept') {
      requireId(params.operationId, 'operação');
      if (params.passageId !== undefined && !samePassage(params.passageId, job.passageId))
        throw error('STALE_CANDIDATE', 'A proposta pertence a outra passagem.');
      const acknowledged = await draftStore.acceptanceReceipt({
        projectId: params.projectId,
        passageId: job.passageId,
        expectedDraftRevision: params.expectedDraftRevision,
        operationId: params.operationId,
        jobId: job.id,
        candidateId: params.candidateId,
        candidateRevision: params.candidateRevision,
      });
      if (acknowledged) {
        // A replay acknowledges an existing decision, even after publication or
        // later edits; it never reapplies the old candidate to the current draft.
        await store.transact(params.projectId, (state) => {
          if (!state.decisions.some((decision) => decision.operationId === params.operationId))
            state.decisions.push({ ...acknowledged.decision, passageId: job.passageId });
        });
        notify(job);
        return acknowledged;
      }
      const candidate = await candidateById(job.id, params.candidateId);
      if (
        job.status !== 'ready-for-review' ||
        !candidate ||
        candidate.status !== 'proposed' ||
        candidate.revisionId !== params.candidateRevision
      )
        throw error(
          'STALE_CANDIDATE',
          'Esta proposta não está disponível para aceitação nesta revisão.',
        );
      const project = currentProject(job.projectId);
      const engineFingerprint = project.engineFingerprint;
      if (!samePassage(candidate.passageId, job.passageId) || candidate.projectId !== project.id)
        throw error('STALE_CANDIDATE', 'A proposta pertence a outra passagem ou projeto.');
      const passage = project.passages.find((item) => samePassage(item.id, job.passageId));
      const envelope = await draftStore.load(project.id);
      const draft = envelope?.drafts[passage?.id ?? job.passageId];
      if (!draft || draft.revisionId !== params.expectedDraftRevision)
        throw error(
          'DRAFT_CONFLICT',
          'Seu rascunho mudou. Abra a proposta novamente na revisão atual.',
        );
      const sourceId = passage?.sourceId ?? draft.pending?.sourceId;
      if (
        sourceId !== job.input.sourceId ||
        (!passage && !draft.pending) ||
        !project.passages.some((item) => item.sourceId === sourceId)
      )
        throw error('STALE_SOURCE', 'A fonte desta proposta não existe na passagem atual.');
      const assertCurrent = () => {
        if (currentProject(project.id).engineFingerprint !== engineFingerprint)
          throw error(
            'STALE_ENGINE',
            'A gramática mudou durante a verificação local. Atualize o projeto.',
          );
      };
      const context = {
        projectId: job.projectId,
        passageId: draft.passageId,
        sourceId,
        engineFingerprint,
        raw: candidate.raw,
        revisionId: candidate.revisionId,
      };
      // Opening an existing proposal copies editable source, not its old approval
      // evidence. Recheck locally; no provider request or historical rewrite.
      const revalidation = {
        engineFingerprint,
        expressionFingerprint: digest(candidate.raw),
        at: now(),
        status: 'failed',
      };
      if (passage) revalidation.sourceFingerprint = passage.sourceFingerprint;
      try {
        const evaluation = await request('evaluate_expression', context);
        if (
          evaluation.revisionId !== candidate.revisionId ||
          evaluation.expression !== candidate.raw ||
          evaluation.engineFingerprint !== engineFingerprint
        )
          throw error(
            'STALE_ENGINE',
            'A verificação local pertence a outra versão. Atualize o projeto.',
          );
        revalidation.status = evaluation.evaluationStatus === 'complete' ? 'complete' : 'partial';
        revalidation.surface = evaluation.surface ?? '';
        revalidation.annotated = evaluation.annotated ?? '';
        const previous = candidate.evaluation;
        if (previous?.revisionId === candidate.revisionId && previous.expression === candidate.raw)
          revalidation.changedSinceProposal =
            revalidation.surface !== (previous.surface ?? '') ||
            revalidation.annotated !== (previous.annotated ?? '') ||
            evaluation.evaluationStatus !== previous.evaluationStatus;
      } catch (reason) {
        if (
          ['STALE_ENGINE', 'STALE_PROJECT', 'STALE_SOURCE', 'PASSAGE_NOT_FOUND'].includes(
            reason?.code,
          )
        )
          throw reason;
        revalidation.error = {
          code: String(reason?.code ?? 'EVALUATION_FAILED').slice(0, 256),
          message: String(reason?.message ?? reason).slice(0, 4000),
        };
      }
      assertCurrent();
      const result = await draftStore.acceptCandidate({
        projectId: params.projectId,
        passageId: draft.passageId,
        expectedDraftRevision: params.expectedDraftRevision,
        operationId: params.operationId,
        jobId: job.id,
        candidate,
        revalidation,
        assertCurrent,
      });
      // The receipt in the human draft is authoritative if the process stops before this mirror.
      await store.transact(params.projectId, (state) => {
        if (!state.decisions.some((decision) => decision.operationId === params.operationId))
          state.decisions.push({ ...result.decision, passageId: job.passageId });
      });
      notify(job);
      return result;
    }
    if (method === 'analysis_cancel') {
      requireId(params.operationId, 'operação');
      const key = 'cancel:' + params.operationId;
      const result = await store.transact(params.projectId, (state) => {
        const prior = own(state.operations, key);
        const value = state.jobs[job.id];
        if (prior) {
          if (prior.jobId !== job.id)
            throw error('OPERATION_CONFLICT', 'Operação de outra análise.');
          return { job: value };
        }
        const attemptId = value.lease?.attemptId;
        state.operations[key] = { jobId: job.id, attemptId, createdAt: now() };
        if (terminal.has(value.status)) return { job: value };
        value.status = attemptId ? 'cancelling' : 'cancelled';
        value.phase = value.status;
        value.updatedAt = now();
        return { job: value, abortAttemptId: attemptId };
      });
      notify(result.job);
      const running = active.get(job.id);
      if (running && running.attemptId === result.abortAttemptId) {
        running.controller.abort(error('CANCELLED', 'Análise cancelada pelo contribuinte.'));
        await running.scope?.revoke();
      }
      return present(result.job);
    }
    if (method === 'analysis_retry') {
      requireId(params.operationId, 'operação');
      assertFresh(job);
      const key = 'retry:' + params.operationId;
      const changed = await store.transact(params.projectId, (state) => {
        const prior = own(state.operations, key);
        if (prior) {
          if (prior.jobId !== job.id)
            throw error('OPERATION_CONFLICT', 'Operação de outra análise.');
          return state.jobs[job.id];
        }
        const value = state.jobs[job.id];
        if (!['blocked', 'failed', 'cancelled'].includes(value.status))
          throw error('JOB_ACTIVE', 'Esta análise não precisa de uma nova tentativa.');
        value.status = 'queued';
        value.phase = 'queued';
        value.updatedAt = now();
        delete value.error;
        delete value.lease;
        state.operations[key] = { jobId: job.id };
        return value;
      });
      notify(changed);
      kick();
      return changed;
    }
    throw error('UNKNOWN_METHOD', 'Operação de análise indisponível.');
  }
  return {
    invoke,
    store,
    scratch,
    gateway,
    callTool,
    start: async () => {
      const project = getProject();
      if (project?.mode === 'local') await initialize(project.id);
      kick();
    },
    hasWork: () => active.size > 0,
    async close() {
      if (closed) return;
      closed = true;
      for (const handle of active.values())
        handle.controller.abort(
          error(
            'INTERRUPTED',
            'O aplicativo foi encerrado. A tentativa foi preservada; repetir pode consumir uso adicional.',
          ),
        );
      await Promise.allSettled([...active.values()].map((handle) => handle.promise));
      await gateway.close();
      await store.close();
    },
  };
}
module.exports = { createAnalysisService };
