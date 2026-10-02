const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PythonWorker } = require('../python-worker.cjs');
const { createNextService } = require('../next-service.cjs');

const root = path.resolve(__dirname, '../..');
const parent = path.resolve(process.env.PYDICATE_PROJECT_PARENT || path.join(root, '..'));
const source = path.join(parent, 'oldtupicorpus/historic/araujo_catecismo_1686.tu.py');

test(
  'actual desktop and Python translation preview preserves meanings, multiline input and constituent scope without inference',
  { skip: !existsSync(source), timeout: 60000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-translation-context-'));
    const worker = new PythonWorker({
      script: path.join(root, 'python/worker.py'),
      stateDirectory: directory,
    });
    let service;
    t.after(async () => {
      service?.close();
      worker.close();
      await fs.rm(directory, { recursive: true, force: true });
    });
    const protectedFiles = [
      source,
      path.join(parent, 'oldtupicorpus/historic/lexicon.tu.py'),
      path.join(parent, 'oldtupicorpus/ground_truth/records/historic/araujo_catecismo_1686.jsonl'),
    ];
    const before = await Promise.all(protectedFiles.map((file) => fs.readFile(file)));
    const project = await worker.request('open_project', { parentPath: parent });
    const passage = project.passages.find((entry) => entry.sourceId === 'araujo_catecismo_1686');
    const methods = [];
    service = createNextService({
      stateDirectory: directory,
      emit() {},
      getProject: () => project,
      getWorker: () => ({
        request(method, params) {
          methods.push(method);
          return worker.request(method, params);
        },
      }),
    });
    const raw =
      'studio_define((potar * moro).var(1).base_nominal(), "sentido do conjunto preservado")';
    const request = {
      projectId: project.id,
      passageId: passage.id,
      revisionId: 'current-local-tree',
      action: 'translate',
      context: {
        raw,
        scope: 'passage',
        sourceId: passage.sourceId,
        engineFingerprint: project.engineFingerprint,
        targetLanguage: 'English',
        diplomatic: "Nã e'i\nsegunda linha",
      },
    };
    const whole = await service.invoke('ai_prompt_preview', request);
    assert.equal(whole.analysisTarget.evaluation.surface, 'moropotara');
    assert.equal(whole.analysisTarget.expression, raw);
    const marker = 'CONTEXTO E PROVENIÊNCIA:\n';
    const evidence = JSON.parse(
      whole.prompt.slice(whole.prompt.lastIndexOf(marker) + marker.length),
    );
    assert.equal(evidence.readingContext.diplomatic, request.context.diplomatic);
    assert.equal(evidence.targetLanguage, 'English');
    assert.equal(
      evidence.analysisTarget.definitionContext.root.compositeDefinition,
      'sentido do conjunto preservado',
    );
    assert.match(JSON.stringify(evidence), /to want, to desire, to wish for/);
    assert.match(JSON.stringify(evidence), /generic, people/);
    assert.equal(evidence.analysisTarget.evaluation.runtimeTree, undefined);

    const start = raw.indexOf('potar');
    const part = await service.invoke('ai_prompt_preview', {
      ...request,
      context: {
        ...request.context,
        scope: 'constituent',
        selectedNode: { id: 'untrusted-id', start, end: start + 5, code: 'potar' },
      },
    });
    assert.equal(part.analysisTarget.expression, 'potar');
    assert.equal(part.analysisTarget.evaluation.expression, 'potar');
    assert.equal(part.analysisTarget.evaluationScope, 'standalone-constituent');
    assert.equal(part.analysisTarget.passageContext.surface, 'moropotara');
    assert.equal(
      part.analysisTarget.definitionContext.root.baseDefinition,
      'to want, to desire, to wish for',
    );
    assert.equal(part.analysisTarget.definitionContext.root.compositeDefinition, undefined);
    assert.deepEqual(methods, ['assistant_context', 'assistant_context', 'assistant_context']);

    // The actual occurrence edit must beat an inherited general interpretation,
    // while keeping independent grammar notes and the other homonym's meaning.
    const noun = "Noun(value='obaîxûara', definition='(t) (s.) - mão de pilão')";
    const original = `${noun} @ ${noun}`;
    const inventoryParams = {
      projectId: project.id,
      passageId: passage.id,
      sourceId: passage.sourceId,
      raw: original,
      revisionId: 'meaning-before',
      engineFingerprint: project.engineFingerprint,
    };
    const inventory = await service.invoke('passage_lexicon', inventoryParams);
    const left = inventory.occurrences.find((item) => item.sourceNodeId === 'root/left');
    const rootOccurrence = inventory.occurrences.find((item) => item.sourceNodeId === 'root');
    const entry = inventory.entries.find((item) => item.id === left.lexicalId);
    const saveNote = (scope, occurrence, fields) =>
      service.invoke('lexical_notes_save', {
        projectId: project.id,
        expectedVersion: 0,
        note: {
          scope,
          lexicalId: occurrence.lexicalId,
          lexicalName: occurrence.name,
          ...(scope === 'occurrence'
            ? {
                sourceId: passage.sourceId,
                passageId: passage.id,
                occurrenceId: occurrence.noteOccurrenceId,
                nodeFingerprint: occurrence.nodeFingerprint,
              }
            : {}),
          revisionId: inventoryParams.revisionId,
          expressionFingerprint: inventory.expressionFingerprint,
          provenance: { definition: entry.definition, expression: original },
          fields: { meaning: '', grammar: '', note: '', ...fields },
        },
      });
    await saveNote('entry', left, { meaning: 'ORIENTAÇÃO GERAL: mão de pilão' });
    await saveNote('occurrence', left, { grammar: 'Contraste nominal nesta ocorrência.' });
    await saveNote('occurrence', rootOccurrence, { grammar: 'Relação entre os dois termos.' });
    await saveNote(
      'entry',
      { lexicalId: 'unrelated-entry', name: 'Outra palavra' },
      {
        meaning: 'PRIVATE_UNRELATED_NOTE',
      },
    );
    const definition = '(t) (etim. - o que está em face) (s.) - oposto, contrário';
    const edited = await service.invoke('node_definition', {
      ...inventoryParams,
      sourceNodeId: 'root/left',
      action: 'set',
      definition,
    });
    const lexicalRequest = {
      ...request,
      revisionId: 'meaning-after',
      context: { ...request.context, raw: edited.raw },
    };
    const lexicalPrompt = await service.invoke('ai_prompt_preview', lexicalRequest);
    const evidenceWithNotes = JSON.parse(
      lexicalPrompt.prompt.slice(lexicalPrompt.prompt.lastIndexOf(marker) + marker.length),
    );
    const bindings = evidenceWithNotes.analysisTarget.interpretationContext.bindings;
    const local = bindings.find((binding) => binding.sourceNodeId === 'root/left');
    assert.equal(local.explicitDefinition, definition);
    assert.equal(local.preferredMeaning, definition);
    assert.equal(local.meaningSource, 'source-definition');
    assert.equal(local.occurrence.fields.grammar, 'Contraste nominal nesta ocorrência.');
    assert.equal(local.originalDefinition, '(t) (s.) - mão de pilão');
    assert.ok(bindings.some((binding) => binding.sourceNodeId === 'root' && binding.occurrence));
    assert.ok(
      bindings.some((binding) => binding.sourceNodeId === 'root/right' && !binding.occurrence),
    );
    assert.doesNotMatch(lexicalPrompt.prompt, /PRIVATE_UNRELATED_NOTE/);
    const rightStart = edited.raw.lastIndexOf(noun);
    const rightPrompt = await service.invoke('ai_prompt_preview', {
      ...lexicalRequest,
      context: {
        ...lexicalRequest.context,
        scope: 'constituent',
        selectedNode: {
          id: 'ignored-client-id',
          start: rightStart,
          end: rightStart + noun.length,
          code: noun,
        },
      },
    });
    assert.doesNotMatch(
      rightPrompt.prompt,
      /Contraste nominal nesta ocorrência|Relação entre os dois termos|PRIVATE_UNRELATED_NOTE/,
    );
    assert.match(rightPrompt.prompt, /ORIENTAÇÃO GERAL/);
    assert.deepEqual(await service.invoke('ai_history', request), []);
    for (let index = 0; index < protectedFiles.length; index++)
      assert.deepEqual(await fs.readFile(protectedFiles[index]), before[index]);
  },
);
