'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createEvidenceService } = require('./evidence-service.cjs');
const { createProviderService } = require('./provider-service.cjs');
const { createLexicalNotesService } = require('./lexical-notes-service.cjs');
const { createAnalysisService } = require('./analysis-service.cjs');
const { createParserLabService } = require('./parser-lab-service.cjs');
const METHODS = new Set([
  'learning_library',
  'parse_expression',
  'evaluate_expression',
  'predicate_catalog',
  'predicate_create',
  'composition_define',
  'node_definition',
  'source_preview',
  'source_new_preview',
  'source_apply',
  'source_recover',
  'source_recovery_list',
  'lexicon_search',
  'structure_search',
  'structure_resolve',
  'lexicon_inspect',
  'lexicon_create',
  'lexicon_update',
  'dictionary_search',
  'dictionary_lookup',
  'dictionary_entry_get',
  'dictionary_predicate',
  'assistant_context',
  'reference_verify',
  'grammar_regression',
  'reference_approve',
  'reference_status',
  'passage_lexicon',
  'contribution_prepare',
]);
function createNextService(options) {
  const { stateDirectory, emit, getProject, getWorker, openPath, defaultParent, chooseFile } =
    options;
  async function workerRequest(method, params) {
    const project = getProject();
    if (
      project &&
      options.draftStore &&
      params?.passageId?.startsWith('pending:') &&
      !Object.hasOwn(params, 'beforePassageId')
    ) {
      const envelope = await options.draftStore.load(project.id);
      params = {
        ...params,
        ...require('./pending-context.cjs').pendingContext(project, envelope, params.passageId),
      };
    }
    return getWorker().request(method, params);
  }
  const settingsFile = path.join(stateDirectory, 'session.json');
  const lexicalNotes = createLexicalNotesService({
    stateDirectory: path.join(stateDirectory, 'lexical-notes'),
  });
  const {
    freezeInterpretationNotes,
    interpretationContext,
  } = require('./interpretation-context.cjs');
  const readInterpretationNotes = async (projectId) =>
    freezeInterpretationNotes(
      (await lexicalNotes.invoke('lexical_notes_list', { projectId })).records,
    );
  async function projectInterpretations(records, params) {
    if (!records?.length) return undefined;
    if (!getWorker() || getProject()?.id !== params.projectId)
      throw new Error('Abra o projeto destas interpretações.');
    const inventory = await workerRequest('passage_lexicon', params);
    return interpretationContext(records, inventory, params);
  }
  let settings = {},
    loaded = false,
    writes = Promise.resolve();
  async function load() {
    if (!loaded) {
      try {
        settings = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT')
          throw new Error('As preferências salvas estão ilegíveis; o arquivo foi preservado.');
      }
      loaded = true;
    }
    return settings;
  }
  async function save(patch) {
    await load();
    settings = { ...settings, ...patch };
    const text = JSON.stringify(settings, null, 2);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(stateDirectory, { recursive: true });
        const temp = settingsFile + '.tmp';
        await fs.writeFile(temp, text, { mode: 0o600 });
        await fs.rename(temp, settingsFile);
      });
    await writes;
  }
  const evidence = createEvidenceService({
    stateDirectory: path.join(stateDirectory, 'evidence'),
    chooseFile,
  });
  const provider = createProviderService({
    stateDirectory: path.join(stateDirectory, 'ai'),
    emit,
    getContext: async (request) => {
      const project = getProject();
      if (!project) throw new Error('Abra o corpus local antes de pedir assistência.');
      if (request.projectId !== project.id)
        throw new Error('A assistência pertence a outro projeto.');
      const passage = project.passages.find((p) => p.id === request.passageId);
      const pending =
        !passage &&
        typeof request.passageId === 'string' &&
        /^pending:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          request.passageId,
        );
      const sourceId = passage?.sourceId ?? request.context?.sourceId;
      if (
        (!passage && !pending) ||
        !project.passages.some((item) => item.sourceId === sourceId) ||
        (request.context?.sourceId !== undefined && request.context.sourceId !== sourceId)
      )
        throw new Error('A passagem ou a fonte da solicitação não existe neste projeto.');
      const context = await workerRequest('assistant_context', {
        projectId: project.id,
        passageId: request.passageId,
        sourceId,
        raw: request.context?.raw ?? request.context?.expression ?? passage?.sourceExpression ?? '',
        revisionId: request.revisionId,
        engineFingerprint: request.context?.engineFingerprint || project.engineFingerprint,
        action: request.action,
      });
      let selectedNode;
      if (request.context?.scope === 'constituent') {
        const wanted = request.context.selectedNode;
        const pending = context.evaluation?.tree ? [context.evaluation.tree] : [];
        while (pending.length) {
          const node = pending.pop();
          if (
            node.start === wanted?.start &&
            node.end === wanted?.end &&
            node.code === wanted?.code
          ) {
            selectedNode = node;
            break;
          }
          pending.push(...(node.children ?? []).map((child) => child.node));
        }
      }
      const interpretations = await projectInterpretations(
        await readInterpretationNotes(project.id),
        {
          projectId: project.id,
          passageId: request.passageId,
          sourceId,
          raw: context.raw,
          revisionId: request.revisionId,
          engineFingerprint: project.engineFingerprint,
          scope: request.context?.scope ?? 'passage',
          selectedNode,
        },
      );
      if (
        getProject()?.id !== project.id ||
        getProject()?.engineFingerprint !== project.engineFingerprint
      )
        throw new Error(
          'O projeto mudou durante a consulta. Solicite novamente com o contexto atual.',
        );
      const corpus = project.repositories.find((r) => r.name === 'oldtupicorpus');
      const engine = project.repositories.find((r) => r.name === 'nhe-enga');
      let pdf = null;
      try {
        pdf = await evidence.invoke('evidence_status', {
          projectId: project.id,
          sourceId,
          passageId: pending ? request.passageId.replace(/^pending:/, 'passage:') : passage.id,
        });
      } catch {
        /* evidence absence is explicit in provider context */
      }
      return {
        ...context,
        corpusPath: corpus?.path,
        enginePath: engine?.path,
        sourceId,
        ordinal: passage?.ordinal ?? context.ordinal,
        pending,
        repositories: project.repositories,
        engineFingerprint: project.engineFingerprint,
        evidence: pdf,
        ...(interpretations ? { interpretationContext: interpretations } : {}),
      };
    },
  });
  const analysis = options.draftStore
    ? createAnalysisService({
        stateDirectory: path.join(stateDirectory, 'analysis'),
        draftStore: options.draftStore,
        evidence,
        getConfig: () => provider.getConfig(),
        getProject,
        reloadProject: options.reloadProject,
        readInterpretationNotes,
        projectInterpretations,
        emit,
        request: (method, params) => {
          if (!getWorker()) throw new Error('Abra o projeto local.');
          return workerRequest(method, params);
        },
      })
    : null;
  // Hidden experimental laboratory. Constructed here so its job records and
  // artifacts are project scoped, but it starts no process until asked.
  const parserLab = createParserLabService({
    stateDirectory: path.join(stateDirectory, 'parser-lab'),
    emit,
    getProject,
    getParent: options.getParent,
    applicationDirectory: options.applicationDirectory ?? path.resolve(__dirname, '..'),
  });
  async function invoke(method, params = {}) {
    if (
      typeof method !== 'string' ||
      !params ||
      typeof params !== 'object' ||
      Array.isArray(params) ||
      Buffer.byteLength(JSON.stringify(params)) > 1_000_000
    )
      throw new Error('Pedido do Studio inválido.');
    if (method === 'session_restore') {
      await load();
      const parent = settings.parentPath ?? defaultParent;
      if (!settings.parentPath && (await options.needsSetup?.(parent)))
        return { project: null, setupRequired: true };
      try {
        const project = await openPath(parent);
        await save({ parentPath: parent });
        await analysis?.start();
        return { project, selectedPassageId: settings.selectedPassageId };
      } catch (e) {
        return {
          project: null,
          error: `Não foi possível restaurar oldtupicorpus: ${e.message}`,
          ...(options.needsSetup ? { setupRequired: true } : {}),
        };
      }
    }
    if (method === 'session_select') {
      const project = getProject();
      if (
        !project ||
        params.projectId !== project.id ||
        (!project.passages.some((p) => p.id === params.passageId) &&
          !(
            typeof params.passageId === 'string' &&
            /^pending:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
              params.passageId,
            )
          ))
      )
        throw new Error('Seleção de passagem inválida.');
      await save({ selectedPassageId: params.passageId });
      return null;
    }
    if (method.startsWith('evidence_')) {
      const project = getProject();
      if (!project || params.projectId !== project.id)
        throw new Error('Abra o projeto correto para consultar sua evidência.');
      const passage = project.passages.find(
        (item) => item.id === params.passageId && item.sourceId === params.sourceId,
      );
      const insertionBoundary = params.insertionBeforePassageId
        ? (project.passages.find((p) => p.id === params.insertionBeforePassageId)?.ordinal ?? 0)
        : Infinity;
      const previousPassages = passage
        ? project.passages
            .filter((item) => item.sourceId === passage.sourceId && item.ordinal < passage.ordinal)
            .sort((a, b) => {
              if (a.id === params.lastVisitedPassageId) return -1;
              if (b.id === params.lastVisitedPassageId) return 1;
              return b.ordinal - a.ordinal;
            })
            .map((item) => ({ id: item.id, ordinal: item.ordinal }))
        : params.newPassageGuide === true
          ? project.passages
              .filter(
                (item) => item.sourceId === params.sourceId && item.ordinal < insertionBoundary,
              )
              .sort((a, b) => b.ordinal - a.ordinal)
              .map((item) => ({ id: item.id, ordinal: item.ordinal }))
          : [];
      return evidence.invoke(method, { ...params, previousPassages });
    }
    if (method.startsWith('lexical_notes_')) {
      if (!getProject() || params.projectId !== getProject().id)
        throw new Error('Abra o projeto correto para consultar as notas lexicais.');
      return lexicalNotes.invoke(method, params);
    }
    if (method.startsWith('parser_lab_')) return parserLab.invoke(method, params);
    if (method.startsWith('analysis_')) {
      if (!analysis) throw new Error('O serviço de análise não está disponível.');
      return analysis.invoke(method, params);
    }
    if (method.startsWith('ai_')) return provider.handle(method, params);
    if (!METHODS.has(method)) throw new Error('Operação indisponível.');
    if (!getWorker() || !getProject()) throw new Error('Abra o projeto local.');
    const execute = async () => {
      const result = await workerRequest(method, params);
      if (method === 'source_apply') options.adoptProject(result);
      if (method === 'reference_approve' && result?.project) options.adoptProject(result.project);
      return result;
    };
    if ((method === 'source_apply' || method === 'reference_approve') && options.duringProjectWrite)
      return options.duringProjectWrite(execute);
    return execute();
  }
  return {
    invoke,
    analysis,
    parserLab,
    saveSession: save,
    hasWork: () => (analysis?.hasWork() ?? false) || parserLab.hasWork(),
    close: async () => {
      await analysis?.close();
      await parserLab.close();
      await provider.close();
      await writes;
    },
  };
}
module.exports = { createNextService };
