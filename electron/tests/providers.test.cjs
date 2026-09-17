const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ClaudeProvider } = require('../provider-claude.cjs');
const { CodexProvider } = require('../provider-codex.cjs');
const { JsonLineRpc } = require('../provider-rpc.cjs');
const {
  createProviderService,
  cleanError,
  promptFor,
  analysisTarget,
} = require('../provider-service.cjs');

function sse(events, fragment = 7) {
  const encoded = new TextEncoder().encode(
    events
      .map((event) => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`)
      .join(''),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let index = 0; index < encoded.length; index += fragment)
          controller.enqueue(encoded.slice(index, index + fragment));
        controller.close();
      },
    }),
  );
}

test('Claude streams actual SSE framing, split UTF8 and usage, with main-only authentication', async () => {
  let request;
  const provider = new ClaudeProvider({
    env: { ANTHROPIC_API_KEY: 'secret-test-value' },
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return sse(
        [
          {
            type: 'message_start',
            message: { id: 'msg-1', model: 'actual-model', usage: { input_tokens: 10 } },
          },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'îub / sujeito' } },
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 3 },
          },
          { type: 'message_stop' },
        ],
        1,
      );
    },
  });
  let text = '';
  const result = await provider.run({
    model: 'requested',
    prompt: 'linguistic context',
    signal: new AbortController().signal,
    onDelta: (chunk) => (text += chunk),
  });
  assert.equal(text, 'îub / sujeito');
  assert.equal(result.model, 'actual-model');
  assert.equal(result.usage.output_tokens, 3);
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.headers.authorization, 'Bearer secret-test-value');
  assert.equal(JSON.parse(request.body).stream, true);
  assert.equal(JSON.parse(request.body).messages[0].content, 'linguistic context');
});

test('Claude distinguishes missing credentials, HTTP rejection, stream error and interrupted response', async () => {
  assert.match((await new ClaudeProvider({ env: {} }).status('model')).detail, /ANTHROPIC_API_KEY/);
  const run = (response) =>
    new ClaudeProvider({
      env: { ANTHROPIC_API_KEY: 'secret' },
      fetchImpl: async () => response,
    }).run({ model: 'model', prompt: 'p', signal: new AbortController().signal, onDelta() {} });
  await assert.rejects(run(new Response('', { status: 401 })), /HTTP 401/);
  await assert.rejects(
    run(
      sse([
        { type: 'error', error: { type: 'overloaded_error', message: 'untrusted provider text' } },
      ]),
    ),
    /overloaded_error/,
  );
  await assert.rejects(
    run(sse([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } }])),
    /interrompida/,
  );
  await assert.rejects(
    run(
      sse([
        { type: 'message_delta', delta: { stop_reason: 'max_tokens' } },
        { type: 'message_stop' },
      ]),
    ),
    /limite/,
  );
});

class FakeRpc {
  constructor() {
    this.calls = [];
    this.sent = [];
    this.listeners = new Set();
    this.closed = false;
  }
  send(message) {
    this.sent.push(message);
  }
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'config/read')
      return { config: { mcp_servers: { secretIntegration: { url: 'not exposed' } } } };
    if (method === 'thread/start') return { thread: { id: 'thread-1' }, model: 'actual-model' };
    if (method === 'turn/start') {
      setImmediate(() => {
        for (const listener of this.listeners)
          listener({
            method: 'item/agentMessage/delta',
            params: { threadId: 'thread-other', delta: 'WRONG' },
          });
        for (const listener of this.listeners)
          listener({
            method: 'item/agentMessage/delta',
            params: { threadId: 'thread-1', delta: 'resposta' },
          });
        for (const listener of this.listeners)
          listener({
            method: 'turn/completed',
            params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
          });
      });
      return { turn: { id: 'turn-1' } };
    }
    return {};
  }
  close() {
    this.closed = true;
  }
}

test('Codex uses supported handshake, read-only thread, disabled host integrations and scoped stream', async () => {
  const rpc = new FakeRpc();
  const provider = new CodexProvider({
    cwd: '/tmp/studio-context',
    rpcFactory: (_command, args) => {
      assert(args.includes('features.shell_tool=false'));
      return rpc;
    },
  });
  let text = '';
  const result = await provider.run({
    model: 'test-model',
    prompt: 'context',
    signal: new AbortController().signal,
    onDelta: (value) => (text += value),
  });
  assert.equal(rpc.calls[0].method, 'initialize');
  assert.equal(rpc.sent[0].method, 'initialized');
  const thread = rpc.calls.find((item) => item.method === 'thread/start').params;
  assert.equal(thread.sandbox, 'read-only');
  assert.equal(thread.approvalPolicy, 'never');
  assert.equal(thread.ephemeral, true);
  assert.equal(thread.config['mcp_servers.secretIntegration.enabled'], false);
  assert.equal(thread.config.model_reasoning_effort, 'medium');
  assert.equal(rpc.calls.find((item) => item.method === 'turn/start').params.effort, 'medium');
  assert.equal(text, 'resposta');
  assert.equal(result.model, 'actual-model');
  assert(rpc.closed);
});

async function fixture(run, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-provider-test-'));
  const events = [];
  const provider = { status: async () => ({ id: 'claude', state: 'available' }), run };
  const service = createProviderService({
    stateDirectory: directory,
    emit: (event) => events.push(event),
    adapters: { codex: provider, claude: provider },
    getContext: async () => ({
      corpusPath: '/not-sent',
      enginePath: '/not-sent',
      revisions: ['dirty-content-hash'],
    }),
    contextLoader: async () => ({
      state: 'blocked',
      diagnostic: 'upstream optional dependency missing',
    }),
    ...options,
  });
  return { directory, service, events };
}
const request = (requestId = 'request-one') => ({
  requestId,
  provider: 'claude',
  action: 'translate',
  projectId: 'project',
  passageId: 'passage',
  revisionId: 'revision-one',
  context: {
    raw: 'nde * apiti',
    description: 'Translate',
    historicalTarget: 'never replace target',
  },
});
async function terminal(fixture, id = 'request-one') {
  for (let count = 0; count < 100; count++) {
    const event = fixture.events.findLast(
      (item) => item.requestId === id && item.status !== 'streaming',
    );
    if (event) return event.result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Test provider did not finish.');
}

test('AI results preserve request revision, exact context, provenance and original translation separately', async (t) => {
  let actualPrompt;
  const f = await fixture(async ({ prompt, onDelta }) => {
    actualPrompt = prompt;
    onDelta('{"translation":"tradução proposta","regressions":[]}');
    return { model: 'actual-model', providerResponseId: 'msg-1' };
  });
  t.after(() => f.service.close());
  assert.deepEqual(await f.service.handle('ai_start', request()), { requestId: 'request-one' });
  const result = await terminal(f);
  assert.equal(result.status, 'completed');
  assert.equal(result.revisionId, 'revision-one');
  assert.equal(result.suggestion.translation, 'tradução proposta');
  assert.equal(result.editorialApproval, null);
  assert.equal(result.context.historicalTarget, 'never replace target');
  assert.match(actualPrompt, /upstream optional dependency missing/);
  assert(!actualPrompt.includes('/not-sent'));
  assert.match(result.inputHash, /^[a-f0-9]{64}$/);
  await assert.rejects(
    f.service.handle('ai_accept', {
      ...request(),
      revisionId: 'revision-newer',
      kind: 'translation',
      text: 'human',
    }),
    /outra revisão/,
  );
  const accepted = await f.service.handle('ai_accept', {
    ...request(),
    kind: 'translation',
    text: 'tradução humana editada',
  });
  assert.equal(accepted.suggestion.translation, 'tradução proposta');
  assert.equal(accepted.acceptances[0].text, 'tradução humana editada');
  const reopened = createProviderService({ stateDirectory: f.directory });
  t.after(() => reopened.close());
  const history = await reopened.handle('ai_history', request());
  assert.equal(history[0].text, result.text);
  assert.equal(history[0].acceptances.length, 1);
  await assert.rejects(f.service.handle('ai_start', request()), /já utilizado/);
});

test('Araújo translation covers all four constituents even when navigation selected the first two', async (t) => {
  const raw =
    '((saba * (santa_cruz * aang)) * esé)\n    + (endé * (pysyro.imp()) * oré)\n    + ((tupan == (oré * îara.voc())))\n    + ((sara * (-(oré * amotar))) * suí)';
  const prefix = raw.slice(0, raw.indexOf('\n    + ((tupan'));
  const input = request('full-araujo');
  input.context = {
    raw,
    scope: 'passage',
    engineFingerprint: 'engine',
    selectedNode: { id: 'root/left/left', start: 0, end: prefix.length, code: prefix },
  };
  const evaluation = {
    expression: raw,
    revisionId: input.revisionId,
    engineFingerprint: 'engine',
    surface: "Santa Cruzra'angaba resé orépysyrõ îepé Tupã oré îar oréamotare'ymbara suí",
    annotated: 'oré[OBJECT:1ppe]pysyrõ[ROOT] îepé[SUBJECT:PRONOUN:2ps:OBJECT_1P]',
    tree: { partial_intermediate_roles: true },
  };
  let sentPrompt;
  const f = await fixture(
    async ({ prompt, onDelta }) => {
      sentPrompt = prompt;
      onDelta('{"translation":"simulated full translation","regressions":[]}');
      return {};
    },
    { getContext: async () => ({ raw, evaluation, engineFingerprint: 'engine' }) },
  );
  t.after(() => f.service.close());
  await f.service.handle('ai_start', input);
  const result = await terminal(f, input.requestId);
  assert.equal(result.status, 'completed');
  assert.equal(result.inputContext.analysisTarget.expression, raw);
  assert.equal(result.inputContext.analysisTarget.evaluation.surface, evaluation.surface);
  assert.equal(result.inputContext.selectedDraft.selectedNode, null);
  assert.equal(result.context.selectedNode.code, prefix, 'original request provenance stays exact');
  assert(!sentPrompt.includes('partial_intermediate_roles'));
  assert.match(sentPrompt, /PASSAGEM INTEIRA/);
  assert.match(sentPrompt, /Grafias diferentes.*não provam contradição/);
  assert(sentPrompt.includes('sara * (-(oré * amotar))'));
  const bytes = JSON.stringify(result);
  const reopened = createProviderService({ stateDirectory: f.directory });
  t.after(() => reopened.close());
  assert.equal(JSON.stringify((await reopened.handle('ai_history', input))[0]), bytes);
});

test('AI target rejects stale evaluations and requires explicit, current spans for partial scope', () => {
  const input = {
    ...request(),
    context: { raw: 'a + b', scope: 'passage', engineFingerprint: 'e' },
  };
  const context = {
    raw: 'a + b',
    engineFingerprint: 'e',
    evaluation: { expression: 'a + b', revisionId: input.revisionId, engineFingerprint: 'e' },
  };
  assert.throws(
    () =>
      analysisTarget(input, { ...context, evaluation: { ...context.evaluation, expression: 'a' } }),
    /outra expressão/,
  );
  assert.throws(
    () =>
      analysisTarget(input, {
        ...context,
        evaluation: { ...context.evaluation, revisionId: 'old' },
      }),
    /outra expressão/,
  );
  assert.throws(
    () => analysisTarget(input, { ...context, evaluation: null }),
    /gerada na revisão atual/,
  );
  const partial = {
    ...input,
    context: {
      ...input.context,
      scope: 'constituent',
      selectedNode: { id: 'left', code: 'a', start: 0, end: 1 },
    },
  };
  assert.equal(analysisTarget(partial, context).expression, 'a');
  assert.equal(analysisTarget(partial, context).evaluation.expression, 'a + b');
  assert.throws(
    () =>
      analysisTarget(
        {
          ...partial,
          context: { ...partial.context, selectedNode: { id: 'old', code: 'b', start: 0, end: 1 } },
        },
        context,
      ),
    /seleção não corresponde/,
  );
});

test('Historical ambiguous selection stays byte-identical when full-translation acceptance is rejected', async (t) => {
  const input = request('old-partial');
  input.context = { raw: 'a + b', selectedNode: { code: 'a', start: 0, end: 1 } };
  const f = await fixture(async ({ onDelta }) => {
    onDelta('{"translation":"partial a","regressions":[]}');
    return {};
  });
  t.after(() => f.service.close());
  await f.service.handle('ai_start', input);
  const record = await terminal(f, input.requestId);
  delete record.inputContext.analysisTarget;
  record.inputHash = createHash('sha256').update(JSON.stringify(record.inputContext)).digest('hex');
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const filename = path.join(
    f.directory,
    'ai',
    digest(input.projectId),
    digest(input.passageId),
    `${digest(input.requestId)}.json`,
  );
  const bytes = JSON.stringify(record, null, 2);
  await fs.writeFile(filename, bytes);
  const reopened = createProviderService({ stateDirectory: f.directory });
  t.after(() => reopened.close());
  assert.equal((await reopened.handle('ai_history', input))[0].suggestion.translation, 'partial a');
  await assert.rejects(
    reopened.handle('ai_accept', { ...input, kind: 'translation', text: 'partial a' }),
    /seleção parcial ou ambígua/,
  );
  assert.equal(await fs.readFile(filename, 'utf8'), bytes);
});

test('Cancellation persists partial output and preserves newer request identity', async (t) => {
  const f = await fixture(async ({ signal, onDelta }) => {
    onDelta('parcial');
    await new Promise((resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
    );
  });
  t.after(() => f.service.close());
  await f.service.handle('ai_start', request());
  for (let count = 0; count < 100 && !f.events.some((event) => event.text === 'parcial'); count++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  await f.service.handle('ai_cancel', { requestId: 'request-one' });
  const result = await terminal(f);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.text, 'parcial');
  assert.equal((await f.service.handle('ai_history', request()))[0].text, 'parcial');
});

test('Provider errors redact secrets and recover with an independent retry', async (t) => {
  let attempt = 0;
  const f = await fixture(
    async ({ onDelta }) => {
      if (!attempt++) throw new Error('token secret-value invalid');
      onDelta('recovered');
      return { model: 'model' };
    },
    { env: { ANTHROPIC_API_KEY: 'secret-value' } },
  );
  t.after(() => f.service.close());
  await f.service.handle('ai_start', request());
  const failed = await terminal(f);
  assert.equal(failed.status, 'failed');
  assert(!failed.error.includes('secret-value'));
  await f.service.handle('ai_start', request('retry'));
  assert.equal((await terminal(f, 'retry')).status, 'completed');
  assert.equal((await f.service.handle('ai_history', request())).length, 2);
  assert.equal(cleanError(new Error('sk-abcdefghijklmno')), '[credencial omitida]');
});

test('Prompt identifies PDF evidence limitation and keeps grammar repairs proposals', () => {
  const prompt = promptFor(
    { action: 'investigate', context: { description: 'read the witness' } },
    { target: 'unchanged' },
  );
  assert.match(prompt, /imagem do fac-símile não está incluída/);
  assert.match(prompt, /Não aplique reparos/);
  assert.match(prompt, /não modifique arquivos/);
});

test('Partial step evidence is described honestly and cannot be translated as a complete result', () => {
  const context = {
    raw: 'tym + missing',
    engineFingerprint: 'current-engine',
    evaluation: {
      expression: 'tym + missing',
      revisionId: 'current-revision',
      engineFingerprint: 'current-engine',
      evaluationStatus: 'partial',
      failures: [
        {
          nodeId: 'root/right',
          expression: 'missing',
          stage: 'reference',
          message: 'Unknown reference',
        },
      ],
    },
  };
  const request = {
    action: 'investigate',
    revisionId: 'current-revision',
    context: { raw: context.raw, scope: 'passage' },
  };
  const prompt = promptFor(request, context);
  assert.match(prompt, /avaliação é PARCIAL/);
  assert.match(prompt, /missing indica encaixe vazio/);
  assert.match(prompt, /engineFrames/);
  assert.doesNotMatch(prompt, /anotações correspondem à expressão COMPLETA/);
  assert.equal(analysisTarget(request, context).expression, context.raw);
  assert.throws(
    () => analysisTarget({ ...request, action: 'translate' }, context),
    /realização completa/,
  );
});

test('Cancellation during unresolved local context terminates immediately and never contacts a provider', async (t) => {
  let resolveContext,
    providerCalls = 0,
    contextSignal;
  const f = await fixture(
    async () => {
      providerCalls++;
    },
    {
      getContext: (_record, { signal }) => {
        contextSignal = signal;
        return new Promise((resolve) => {
          resolveContext = resolve;
        });
      },
    },
  );
  t.after(() => f.service.close());
  await f.service.handle('ai_start', request());
  while (!resolveContext) await new Promise((resolve) => setImmediate(resolve));
  await f.service.handle('ai_cancel', { requestId: request().requestId });
  const stopped = await terminal(f);
  assert.equal(stopped.status, 'cancelled');
  assert(contextSignal.aborted);
  assert.equal(stopped.inputContext, null);
  resolveContext({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(providerCalls, 0);
  assert.equal((await f.service.handle('ai_history', request()))[0].phase, 'cancelled');
});

test('MCP cancellation forwards the signal and never proceeds to generation', async (t) => {
  let mcpSignal,
    providerCalls = 0;
  const f = await fixture(
    async () => {
      providerCalls++;
    },
    {
      contextLoader: (_context, _record, { signal }) => {
        mcpSignal = signal;
        return new Promise(() => {});
      },
    },
  );
  t.after(() => f.service.close());
  await f.service.handle('ai_start', request());
  while (!mcpSignal) await new Promise((resolve) => setImmediate(resolve));
  await f.service.handle('ai_cancel', { requestId: request().requestId });
  assert.equal((await terminal(f)).status, 'cancelled');
  assert(mcpSignal.aborted);
  assert.equal(providerCalls, 0);
});

test('Unresponsive transport cannot outlive its deadline, emit late output or consume a retry', async (t) => {
  let lateDelta,
    calls = 0;
  const f = await fixture(
    async ({ onDelta, onProgress }) => {
      calls++;
      lateDelta = onDelta;
      onProgress('provider_wait');
      return new Promise(() => {});
    },
    { timeoutMs: 100, phaseTimeouts: { provider_wait: 40 } },
  );
  t.after(() => f.service.close());
  await f.service.handle('ai_start', request());
  const failed = await terminal(f);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /espera da primeira resposta/);
  assert.deepEqual(
    failed.progress.map((item) => item.phase),
    ['source_context', 'mcp_context', 'provider_connect', 'provider_wait', 'failed'],
  );
  lateDelta('must not return');
  assert.equal((await f.service.handle('ai_history', request()))[0].text, '');
  assert.equal(calls, 1);
});

test('Request progress and explicit Studio reasoning selection survive restart', async (t) => {
  let configuredEffort;
  const f = await fixture(async ({ onProgress, reasoningEffort, onDelta }) => {
    configuredEffort = reasoningEffort;
    onProgress('provider_reasoning');
    onDelta('finished');
    return { model: 'chosen-model' };
  });
  t.after(() => f.service.close());
  await f.service.handle('ai_configure', {
    provider: 'codex',
    model: 'chosen-model',
    reasoningEffort: 'low',
  });
  await f.service.handle('ai_start', { ...request(), provider: 'codex' });
  const done = await terminal(f);
  assert.equal(configuredEffort, 'low');
  assert.equal(done.reasoningEffort, 'low');
  assert(done.progress.some((item) => item.phase === 'provider_reasoning'));
  assert.equal(done.phase, 'completed');
  const reopened = createProviderService({ stateDirectory: f.directory });
  t.after(() => reopened.close());
  const restored = (await reopened.handle('ai_history', request()))[0];
  assert.deepEqual(restored.progress, done.progress);
  assert.equal(restored.reasoningEffort, 'low');
});

test('Codex records reasoning activity and authoritative completed text without text deltas', async () => {
  const rpc = new FakeRpc();
  const original = rpc.request.bind(rpc);
  rpc.request = async (method, params) => {
    if (method !== 'turn/start') return original(method, params);
    setImmediate(() => {
      const messages = [
        {
          method: 'item/started',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'reason', type: 'reasoning' },
          },
        },
        {
          method: 'thread/tokenUsage/updated',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            tokenUsage: { last: { inputTokens: 11, outputTokens: 4 } },
          },
        },
        {
          method: 'item/completed',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { type: 'agentMessage', id: 'answer', text: 'complete answer' },
          },
        },
        {
          method: 'turn/completed',
          params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
        },
      ];
      for (const message of messages) for (const listener of rpc.listeners) listener(message);
    });
    return { turn: { id: 'turn-1' } };
  };
  const phases = [],
    chunks = [];
  const provider = new CodexProvider({ rpcFactory: () => rpc });
  const result = await provider.run({
    model: 'selected',
    reasoningEffort: 'low',
    prompt: 'synthetic',
    signal: new AbortController().signal,
    onProgress: (phase) => phases.push(phase),
    onDelta: (text) => chunks.push(text),
  });
  assert(phases.includes('provider_reasoning'));
  assert.equal(chunks.join(''), 'complete answer');
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 4 });
  assert.equal(result.reasoningEffort, 'low');
});

test(
  'Cancelling Codex during initialization closes the local child before any turn',
  { timeout: 2000 },
  async () => {
    let rpc;
    const provider = new CodexProvider({
      rpcFactory: () => {
        rpc = new JsonLineRpc(process.execPath, ['-e', 'process.stdin.resume();']);
        return rpc;
      },
    });
    const controller = new AbortController();
    const pending = provider.run({
      model: 'synthetic',
      prompt: 'never sent',
      signal: controller.signal,
      onDelta() {},
    });
    controller.abort();
    await assert.rejects(pending, /encerrada|cancelada/);
    assert.equal(rpc.closed, true);
    assert.equal(rpc.pending.size, 0);
  },
);

test('Codex gives turn interruption an acknowledgement window before closing its transport', async () => {
  const rpc = new FakeRpc();
  let acknowledge;
  const original = rpc.request.bind(rpc);
  rpc.request = async (method, params) => {
    if (method === 'turn/start') {
      rpc.calls.push({ method, params });
      return { turn: { id: 'turn-1' } };
    }
    if (method === 'turn/interrupt') {
      rpc.calls.push({ method, params });
      return new Promise((resolve) => {
        acknowledge = resolve;
      });
    }
    return original(method, params);
  };
  rpc.close = () => {
    rpc.closed = true;
    for (const listener of rpc.listeners)
      listener({ method: 'studio/disconnected', params: { error: 'fixture closed' } });
  };
  const controller = new AbortController();
  const pending = new CodexProvider({ rpcFactory: () => rpc }).run({
    model: 'synthetic',
    prompt: 'fixture',
    signal: controller.signal,
    onDelta() {},
  });
  while (!rpc.calls.some((call) => call.method === 'turn/start'))
    await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  assert.equal(rpc.closed, false);
  assert.deepEqual(rpc.calls.find((call) => call.method === 'turn/interrupt').params, {
    threadId: 'thread-1',
    turnId: 'turn-1',
  });
  acknowledge({});
  await assert.rejects(pending, /fixture closed/);
  assert.equal(rpc.closed, true);
});

test('Persisted AI schema corruption rejects history and acceptance while preserving exact bytes', async (t) => {
  // Controlled local provider fixture: no account, network, or corpus access.
  let providerCalls = 0;
  const f = await fixture(async ({ onDelta }) => {
    providerCalls++;
    onDelta('{"translation":"synthetic result","regressions":[]}');
    return { model: 'synthetic-model', providerResponseId: 'synthetic-response', usage: null };
  });
  t.after(async () => {
    f.service.close();
    await fs.rm(f.directory, { recursive: true, force: true });
  });
  await f.service.handle('ai_start', request());
  await terminal(f);
  await f.service.handle('ai_accept', {
    ...request(),
    kind: 'translation',
    text: 'synthetic human choice',
  });
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const filename = path.join(
    f.directory,
    'ai',
    digest('project'),
    digest('passage'),
    `${digest('request-one')}.json`,
  );
  const validBytes = await fs.readFile(filename, 'utf8');
  const valid = JSON.parse(validBytes);
  const cases = [
    ['null envelope', () => null],
    ['array envelope', () => []],
    ['unknown schema version', (record) => ({ ...record, version: 2 })],
    ['missing revision', ({ revisionId: _revision, ...record }) => record],
    ['invalid project identity', (record) => ({ ...record, projectId: 42 })],
    ['wrong passage binding', (record) => ({ ...record, passageId: 'another-passage' })],
    ['wrong request filename', (record) => ({ ...record, requestId: 'another-request' })],
    ['unknown provider', (record) => ({ ...record, provider: 'unrecognized' })],
    ['invalid model', (record) => ({ ...record, model: {} })],
    ['unknown action', (record) => ({ ...record, action: 'rewrite-source' })],
    ['non-object request context', (record) => ({ ...record, context: [] })],
    ['non-object input context', (record) => ({ ...record, inputContext: 'corrupt' })],
    ['invalid input hash type', (record) => ({ ...record, inputHash: 42 })],
    ['mismatched provenance hash', (record) => ({ ...record, inputHash: '0'.repeat(64) })],
    [
      'missing completed provenance',
      (record) => ({ ...record, inputContext: null, inputHash: null }),
    ],
    ['non-string output', (record) => ({ ...record, text: 42 })],
    ['non-object suggestion', (record) => ({ ...record, suggestion: [] })],
    [
      'non-string suggestion',
      (record) => ({ ...record, suggestion: { translation: 42, regressions: [] } }),
    ],
    ['non-array regressions', (record) => ({ ...record, suggestion: { regressions: 'corrupt' } })],
    ['non-string regression', (record) => ({ ...record, suggestion: { regressions: [42] } })],
    ['unknown status', (record) => ({ ...record, status: 'approved' })],
    ['invalid error', (record) => ({ ...record, error: {} })],
    ['missing start timestamp', ({ startedAt: _started, ...record }) => record],
    ['invalid finish timestamp', (record) => ({ ...record, finishedAt: 'not-a-date' })],
    ['missing completed timestamp', (record) => ({ ...record, finishedAt: null })],
    ['non-array acceptances', (record) => ({ ...record, acceptances: 'corrupt' })],
    [
      'unknown acceptance kind',
      (record) => ({
        ...record,
        acceptances: [{ ...record.acceptances[0], kind: 'approve-source' }],
      }),
    ],
    [
      'non-string accepted text',
      (record) => ({ ...record, acceptances: [{ ...record.acceptances[0], text: 42 }] }),
    ],
    [
      'wrong acceptance revision',
      (record) => ({
        ...record,
        acceptances: [{ ...record.acceptances[0], revisionId: 'newer-revision' }],
      }),
    ],
    [
      'invalid acceptance timestamp',
      (record) => ({ ...record, acceptances: [{ ...record.acceptances[0], at: null }] }),
    ],
    [
      'invented acceptance actor',
      (record) => ({ ...record, acceptances: [{ ...record.acceptances[0], actor: 'model' }] }),
    ],
    ['manufactured editorial approval', (record) => ({ ...record, editorialApproval: true })],
    ['invalid provider response identity', (record) => ({ ...record, providerResponseId: [] })],
    ['invalid usage envelope', (record) => ({ ...record, usage: [] })],
    ['invalid progress phase', (record) => ({ ...record, phase: 'untracked' })],
    ['invalid progress timestamp', (record) => ({ ...record, updatedAt: 'yesterday' })],
    [
      'invalid progress history',
      (record) => ({ ...record, progress: [{ phase: 'completed', at: 'bad' }] }),
    ],
    ['invalid reasoning effort', (record) => ({ ...record, reasoningEffort: { value: 'ultra' } })],
    ['unknown schema field', (record) => ({ ...record, fabricated: true })],
  ];
  for (const [name, corrupt] of cases) {
    await t.test(name, async () => {
      const bytes = JSON.stringify(corrupt(structuredClone(valid)));
      await fs.writeFile(filename, bytes);
      await assert.rejects(
        f.service.handle('ai_history', request()),
        /corrompido; arquivo preservado/,
      );
      await assert.rejects(
        f.service.handle('ai_accept', {
          ...request(),
          kind: 'translation',
          text: 'must not be written',
        }),
        /corrompido; arquivo preservado/,
      );
      await assert.rejects(f.service.handle('ai_start', request()), /já utilizado/);
      assert.equal(await fs.readFile(filename, 'utf8'), bytes);
      assert.equal(providerCalls, 1);
    });
  }
  await fs.writeFile(filename, validBytes);
  assert.deepEqual(await f.service.handle('ai_history', request()), [valid]);
});
