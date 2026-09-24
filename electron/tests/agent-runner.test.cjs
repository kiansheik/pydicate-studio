const test = require('node:test');
const assert = require('node:assert/strict');
const { runAgent, validateSchema, STRATEGY, toolContent } = require('../agent-runner.cjs');
const { ClaudeProvider } = require('../provider-claude.cjs');
const { CodexProvider, DISABLED_AGENT_FEATURES } = require('../provider-codex.cjs');
const { JsonLineRpc } = require('../provider-rpc.cjs');

const tools = [
  'dictionary_search',
  'dictionary_lookup',
  'scratch_create',
  'scratch_edit',
  'scratch_evaluate',
  'candidate_propose',
  'evidence_get',
].map((name) => ({
  name,
  description: name,
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string', minLength: 1 }, candidate: { type: 'string' } },
    additionalProperties: false,
  },
}));
const input = {
  digest: 'frozen-input-1',
  passageId: 'pending:1',
  baseRevisionId: 'r1',
  task: 'analyze',
  diplomatic: 'abaregûasu',
  tentativeReading: 'abaregûasu',
  reviewedTarget: null,
};
const mcp = {
  name: 'studio_authoring',
  command: process.execPath,
  args: ['/fixture/studio-mcp-stdio.cjs'],
  env: { STUDIO_MCP_SOCKET: '/tmp/scoped.sock', STUDIO_MCP_TOKEN: 'private-test-capability' },
  toolNames: tools.map((t) => t.name),
};
function eventsFor(
  content,
  stop = content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
  id = 'msg-fixture',
) {
  const events = [
    { type: 'message_start', message: { id, model: 'fixture-model', usage: { input_tokens: 12 } } },
  ];
  content.forEach((block, index) => {
    const text =
      block.type === 'text' ? block.text : (block.rawInput ?? JSON.stringify(block.input));
    events.push({
      type: 'content_block_start',
      index,
      content_block:
        block.type === 'text'
          ? { type: 'text', text: '' }
          : { type: 'tool_use', name: block.name, id: block.id, input: {} },
    });
    for (let i = 0; i < text.length; i += 3)
      events.push({
        type: 'content_block_delta',
        index,
        delta:
          block.type === 'text'
            ? { type: 'text_delta', text: text.slice(i, i + 3) }
            : { type: 'input_json_delta', partial_json: text.slice(i, i + 3) },
      });
    events.push({ type: 'content_block_stop', index });
  });
  events.push(
    { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 8 } },
    { type: 'message_stop' },
  );
  return events;
}
function sse(events, fragment = 1) {
  const bytes = Buffer.from(
    events
      .map((event) => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`)
      .join(''),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += fragment)
          controller.enqueue(bytes.subarray(i, i + fragment));
        controller.close();
      },
    }),
  );
}
function claudeFixture(rounds) {
  const requests = [];
  const provider = new ClaudeProvider({
    env: { ANTHROPIC_API_KEY: 'secret' },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      const round = rounds.shift();
      assert(round, 'unexpected billed request');
      return typeof round === 'function' ? round(body, options) : sse(eventsFor(round));
    },
  });
  return { provider, requests };
}
const call = (id, name, args = { query: 'abaregûasu' }) => ({
  type: 'tool_use',
  id,
  name,
  input: args,
});
const answer = (text = 'Candidato preservado; sentido ainda requer revisão.') => ({
  type: 'text',
  text,
});
async function runClaude(fixture, options = {}) {
  return runAgent({
    provider: 'claude',
    providers: { claude: fixture.provider },
    model: 'fixture-model',
    input,
    tools,
    callTool: async () => ({ ok: true }),
    ...options,
  });
}

test('Claude performs dictionary, builder, evaluation and proposal rounds with durable results and real images', async () => {
  const f = claudeFixture([
    [call('dict', 'dictionary_search')],
    [call('sense', 'dictionary_lookup'), call('image', 'evidence_get')],
    [call('create', 'scratch_create')],
    [call('eval', 'scratch_evaluate', { candidate: 'c1' })],
    [call('proposal', 'candidate_propose', { candidate: 'c1' })],
    [answer()],
  ]);
  const calls = [],
    events = [],
    checkpoints = [];
  const result = await runClaude(f, {
    images: [{ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }],
    onEvent: async (e) => events.push(e),
    onCheckpoint: async (c) => checkpoints.push(structuredClone(c)),
    callTool: async (name, args, options) => {
      assert(checkpoints.at(-1).pendingCall, 'intent persisted before dispatch');
      assert.match(options.operationId, /agent:/);
      calls.push(name);
      return name === 'evidence_get'
        ? { content: [{ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }] }
        : {
            candidate: 'c1',
            revision: 'c2',
            surface: 'abaregûasu',
            definition: 'bispo; autoridade eclesiástica',
            dataset: { checksum: 'exact', rowIndex: 71 },
          };
    },
  });
  assert.equal(f.requests.length, 6);
  assert.equal(calls.length, 6);
  assert.equal(result.usage.output_tokens, 48);
  assert.equal(result.checkpoint.phase, 'completed');
  assert.equal(f.requests[0].messages[0].content[1].type, 'image');
  assert(
    f.requests[2].messages
      .at(-1)
      .content.find((c) => c.tool_use_id === 'image')
      .content.some((c) => c.type === 'image'),
  );
  assert.equal(events.filter((e) => e.type === 'tool-result').length, 6);
  assert(
    f.requests.every((r) =>
      r.tools.every((t) => t.name !== 'source_apply' && t.name !== 'ground_truth_approve'),
    ),
  );
  assert.match(STRATEGY, /translate-source/);
  assert.match(STRATEGY, /NOT independent evidence/);
});

test('malformed arguments and unknown tools become visible tool errors without execution; next round repairs', async () => {
  const f = claudeFixture([
    [{ ...call('bad', 'scratch_edit'), rawInput: '{"query":' }, call('forbidden', 'source_apply')],
    [call('fixed', 'scratch_edit')],
    [answer()],
  ]);
  const executed = [];
  await runClaude(f, {
    callTool: async (name) => {
      executed.push(name);
      return { ok: true };
    },
  });
  assert.deepEqual(executed, ['scratch_edit']);
  const resultMessages = f.requests[1].messages.at(-1).content;
  assert(resultMessages.every((r) => r.is_error));
  assert.match(resultMessages[0].content[0].text, /INVALID_TOOL_ARGUMENTS/);
  assert.match(resultMessages[1].content[0].text, /UNKNOWN_TOOL/);
  assert.equal(
    f.requests[1].messages.at(-2).content[0].invalidArguments,
    undefined,
    'internal parser flags never sent to API',
  );
});

test('repeated tool call ID reuses the exact durable result; conflicting reuse fails', async () => {
  const f = claudeFixture([
    [call('same', 'scratch_create')],
    [call('same', 'scratch_create')],
    [answer()],
  ]);
  let calls = 0;
  await runClaude(f, { callTool: async () => ({ id: `candidate-${++calls}` }) });
  assert.equal(calls, 1);
  assert.deepEqual(
    f.requests[1].messages.at(-1).content[0].content,
    f.requests[2].messages.at(-1).content[0].content,
  );
  const conflict = claudeFixture([
    [call('same', 'scratch_create')],
    [call('same', 'scratch_edit')],
  ]);
  await assert.rejects(runClaude(conflict), { code: 'TOOL_CALL_ID_REUSE' });
  const duplicate = claudeFixture([
    [call('same', 'scratch_create'), call('same', 'scratch_create')],
  ]);
  await assert.rejects(runClaude(duplicate), { code: 'TOOL_CALL_ID_REUSE' });
});

test('partial streams preserve visible text and never execute unfinished tool arguments', async () => {
  const events = eventsFor([answer('parcial îub'), call('unfinished', 'scratch_create')]);
  events.splice(-3);
  const f = claudeFixture([() => sse(events)]);
  let calls = 0,
    text = '';
  await assert.rejects(
    runClaude(f, {
      onEvent: async (e) => {
        if (e.type === 'text-delta') text += e.text;
      },
      callTool: async () => {
        calls++;
      },
    }),
    { code: 'PROVIDER_STREAM' },
  );
  assert.equal(calls, 0);
  assert.equal(text, 'parcial îub');
});

test('cancellation during a pending tool returns promptly, rejects late results, and prevents another provider round', async () => {
  const f = claudeFixture([[call('pending', 'scratch_create')]]);
  const controller = new AbortController();
  let release, started;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  const events = [];
  const pending = runClaude(f, {
    signal: controller.signal,
    onEvent: async (e) => events.push(e),
    callTool: () => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  await waiting;
  controller.abort();
  await assert.rejects(pending, /abort|cancel/i);
  const count = events.length;
  release({ late: 'ignored' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.length, count);
  assert.equal(f.requests.length, 1);
});

test('durable pending-tool checkpoint resumes by operation ID; feedback carries a new explicit input revision', async () => {
  const f = claudeFixture([[call('pending', 'scratch_create')]]);
  const controller = new AbortController();
  let saved, operation;
  await assert.rejects(
    runClaude(f, {
      signal: controller.signal,
      onCheckpoint: async (c) => {
        saved = structuredClone(c);
      },
      callTool: async (_n, _a, options) => {
        operation = options.operationId;
        controller.abort();
        return { id: 'already-committed' };
      },
    }),
  );
  assert.equal(saved.phase, 'tool-pending');
  const resumed = claudeFixture([[answer('Revisão retomada.')]]);
  const result = await runClaude(resumed, {
    checkpoint: saved,
    budgets: { maxSteps: 1 },
    callTool: async (_n, _a, options) => {
      assert.equal(options.operationId, operation);
      return { id: 'already-committed' };
    },
  });
  assert.equal(result.text, 'Revisão retomada.');
  assert.equal(resumed.requests[0].messages.at(-1).content[0].tool_use_id, 'pending');
  const feedback = claudeFixture([
    [call('feedback', 'scratch_edit')],
    [answer('Outro sentido preservado.')],
  ]);
  await runClaude(feedback, {
    input: {
      ...input,
      digest: 'new-turn',
      baseRevisionId: 'r2',
      description: 'Use o outro sentido',
      candidateId: 'c1',
      candidateRevision: 'c2',
    },
    messages: result.messages,
  });
  assert.match(feedback.requests[0].messages.at(-1).content, /Use o outro sentido/);
  assert.match(feedback.requests[0].messages.at(-1).content, /candidateRevision/);
  await assert.rejects(
    runClaude(feedback, { input: { ...input, digest: 'wrong' }, checkpoint: saved }),
    { code: 'INVALID_CHECKPOINT' },
  );
});

test('budgets stop loops and unresponsive transport without automatic billed retry', async () => {
  const f = claudeFixture([[call('one', 'dictionary_search')], [call('two', 'dictionary_search')]]);
  await assert.rejects(runClaude(f, { budgets: { maxSteps: 1, maxRounds: 3 } }), {
    code: 'STEP_BUDGET',
  });
  const slow = claudeFixture([() => new Promise(() => {})]);
  await assert.rejects(runClaude(slow, { budgets: { timeoutMs: 100 } }), { code: 'JOB_TIMEOUT' });
  assert.equal(slow.requests.length, 1);
  const truncated = claudeFixture([() => sse(eventsFor([answer('limit')], 'max_tokens'))]);
  let saved;
  await assert.rejects(
    runClaude(truncated, {
      onCheckpoint: async (c) => {
        saved = c;
      },
    }),
    { code: 'OUTPUT_BUDGET' },
  );
  assert.equal(saved.messages.at(-1).content[0].text, 'limit');
});

test('explicit continuation resumes a terminal response with fresh attempt budgets and preserved history', async () => {
  const original = claudeFixture([[answer('Qual sentido você pretende?')]]);
  const first = await runClaude(original, { budgets: { maxRounds: 1, maxOutputTokens: 64 } });
  first.checkpoint.steps = 1;
  first.checkpoint.usage.output_tokens = 64;
  const resumed = claudeFixture([
    [call('continued', 'dictionary_search')],
    [answer('Sentido retomado.')],
  ]);
  const calls = [];
  const result = await runClaude(resumed, {
    checkpoint: first.checkpoint,
    continuation: { context: { instruction: 'Use o segundo sentido.' } },
    budgets: { maxRounds: 2, maxSteps: 1, maxOutputTokens: 64 },
    callTool: async (name) => {
      calls.push(name);
      return { meaning: 'second sense' };
    },
  });
  assert.equal(result.text, 'Sentido retomado.');
  assert.deepEqual(calls, ['dictionary_search']);
  assert.match(JSON.stringify(resumed.requests[0].messages), /Qual sentido/);
  assert.match(resumed.requests[0].messages.at(-1).content, /Use o segundo sentido/);
  assert.equal(result.usage.output_tokens, 16, 'usage belongs to the new attempt');
  assert.equal(first.checkpoint.phase, 'completed', 'previous checkpoint is immutable');
  assert.equal(first.checkpoint.usage.output_tokens, 64);
});

test('continuation recovers committed pending tool receipts and closes unknown calls without replaying writes', async () => {
  const pending = [call('saved', 'scratch_create'), call('unknown', 'scratch_edit')];
  const signature = JSON.stringify(['scratch_create', pending[0].input]);
  const resumed = claudeFixture([[answer('Propostas existentes conferidas.')]]);
  const result = await runClaude(resumed, {
    checkpoint: {
      version: 1,
      provider: 'claude',
      inputDigest: input.digest,
      phase: 'tool-pending',
      messages: [{ role: 'assistant', content: pending }],
      calls: [],
      round: 10,
      steps: 10,
      usage: { output_tokens: 8000 },
      pendingCall: { id: 'unknown' },
    },
    continuation: {
      context: { instruction: 'Continue.' },
      toolReceipts: { saved: { signature, result: { id: 'candidate:already-committed' } } },
    },
    callTool: async () => {
      assert.fail('an interrupted write must not be replayed');
    },
  });
  const responses = resumed.requests[0].messages[1].content;
  assert.equal(responses.length, 2);
  assert.match(JSON.stringify(responses[0]), /candidate:already-committed/);
  assert.equal(responses[0].is_error, undefined);
  assert.equal(responses[1].is_error, true);
  assert.match(JSON.stringify(responses[1]), /INTERRUPTED_TOOL/);
  assert.equal(result.checkpoint.pendingCall, undefined);
});

test('Codex continuation retains observable tool evidence and resets its attempt budget', async () => {
  const provider = {
    id: 'codex',
    runAgent: async ({ checkpoint, messages }) => {
      assert.equal(checkpoint.steps, 0);
      assert.equal(checkpoint.round, 0);
      assert.deepEqual(checkpoint.usage, {});
      assert.equal(checkpoint.toolEvents[0].callId, 'prior-call');
      assert.match(messages.at(-1).content, /Continue a tradução/);
      return { text: 'Resumed.' };
    },
  };
  const result = await runAgent({
    provider,
    input,
    tools,
    checkpoint: {
      version: 1,
      provider: 'codex',
      inputDigest: input.digest,
      phase: 'completed',
      messages: [{ role: 'assistant', content: 'Saved response' }],
      calls: [],
      steps: 20,
      round: 1,
      usage: { output_tokens: 8000 },
      toolEvents: [{ type: 'tool-result', callId: 'prior-call' }],
    },
    continuation: { context: { instruction: 'Continue a tradução.' } },
  });
  assert.equal(result.text, 'Resumed.');
});

class CodexRpc {
  constructor(rounds) {
    this.rounds = rounds;
    this.calls = [];
    this.sent = [];
    this.listeners = new Set();
    this.closed = false;
  }
  send(message) {
    this.sent.push(message);
  }
  emit(method, params) {
    for (const listener of this.listeners)
      listener({ method, params: { threadId: 'thread', turnId: 'turn', ...params } });
  }
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'config/read')
      return {
        config: {
          mcp_servers: { privateConnector: { command: '/external', enabled: true } },
          features: { apps: true, plugins: true },
        },
      };
    if (method === 'thread/start') return { thread: { id: 'thread' }, model: 'fixture' };
    if (method === 'mcpServerStatus/list')
      return {
        data: [
          {
            name: 'studio_authoring',
            runtimeStatus: 'connected',
            tools: Object.fromEntries(tools.map((tool) => [tool.name, tool])),
          },
        ],
      };
    if (method === 'turn/start') {
      setImmediate(() => this.rounds?.(this));
      return { turn: { id: 'turn' } };
    }
    return {};
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.listeners)
      listener({ method: 'studio/disconnected', params: { error: 'closed' } });
  }
}
function codexTool(
  rpc,
  id,
  tool,
  args,
  result = { content: [{ type: 'text', text: 'actual tool fixture' }] },
) {
  const item = {
    type: 'mcpToolCall',
    id,
    server: 'studio_authoring',
    tool,
    arguments: args,
    status: 'inProgress',
  };
  rpc.emit('item/started', { item });
  rpc.emit('item/completed', { item: { ...item, status: 'completed', result } });
}
function codexFinish(rpc, text = 'Candidato com evidência.') {
  rpc.emit('item/completed', { item: { type: 'agentMessage', id: 'answer', text } });
  rpc.emit('turn/completed', { turn: { id: 'turn', status: 'completed' } });
}
function runCodex(rpc, options = {}) {
  return runAgent({
    provider: 'codex',
    providers: { codex: new CodexProvider({ cwd: '/tmp/studio-empty', rpcFactory: () => rpc }) },
    model: 'fixture',
    input,
    tools,
    mcp,
    ...options,
  });
}
test('Codex refuses incomplete or foreign MCP inventories before any model request', async (t) => {
  const studio = {
    name: 'studio_authoring',
    runtimeStatus: 'connected',
    tools: Object.fromEntries(tools.map((tool) => [tool.name, tool])),
  };
  for (const [label, inventory] of [
    ['missing server', { data: [] }],
    ['partial discovery', { data: [{ ...studio, tools: { [tools[0].name]: tools[0] } }] }],
    ['failed startup', { data: [{ ...studio, runtimeStatus: 'failed' }] }],
    ['foreign tools', { data: [studio, { name: 'foreign', tools: { shell: { name: 'shell' } } }] }],
  ])
    await t.test(label, async () => {
      const rpc = new CodexRpc(() => {
        throw new Error('must not generate');
      });
      const request = rpc.request.bind(rpc);
      rpc.request = (method, params) =>
        method === 'mcpServerStatus/list' ? Promise.resolve(inventory) : request(method, params);
      await assert.rejects(runCodex(rpc), { code: 'MCP_UNAVAILABLE' });
      assert(!rpc.calls.some((call) => call.method === 'turn/start'));
      assert(rpc.closed);
    });
});
test('Codex drives several real MCP notification rounds with only scoped capabilities and explicit checkpoint continuity', async () => {
  const rpc = new CodexRpc((r) => {
    r.emit('item/reasoning/textDelta', { delta: 'PRIVATE NOT STORED' });
    codexTool(r, 'dict', 'dictionary_lookup', { query: 'abaregûasu' });
    codexTool(r, 'create', 'scratch_create', { query: 'abaregûasu' });
    codexTool(r, 'eval', 'scratch_evaluate', { candidate: 'c1' });
    codexTool(r, 'propose', 'candidate_propose', { candidate: 'c1' });
    codexFinish(r);
  });
  const checkpoints = [],
    events = [];
  const result = await runCodex(rpc, {
    images: [{ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }],
    onEvent: async (e) => events.push(e),
    onCheckpoint: async (c) => checkpoints.push(c),
  });
  const thread = rpc.calls.find((c) => c.method === 'thread/start').params;
  assert.equal(thread.config['mcp_servers.privateConnector.enabled'], false);
  assert.equal(thread.config['mcp_servers.studio_authoring'].enabled, true);
  assert.deepEqual(
    thread.config['mcp_servers.studio_authoring'].enabled_tools,
    tools.map((t) => t.name),
  );
  assert.deepEqual(thread.environments, []);
  assert.equal(thread.approvalPolicy, 'never');
  for (const feature of DISABLED_AGENT_FEATURES)
    assert.equal(thread.config[`features.${feature}`], false);
  assert.equal(thread.config['features.skip_host_skill_discovery'], true);
  assert.equal(thread.config['features.code_mode_host'], true);
  const catalogIndex = rpc.calls.findIndex((c) => c.method === 'mcpServerStatus/list');
  assert(catalogIndex > 0 && catalogIndex < rpc.calls.findIndex((c) => c.method === 'turn/start'));
  assert.equal(thread.config.web_search, 'disabled');
  const turn = rpc.calls.find((c) => c.method === 'turn/start').params;
  assert.equal(turn.input[1].type, 'image');
  assert.match(turn.input[1].url, /^data:image\/png;base64,/);
  assert(!turn.input[0].text.includes('aGVsbG8='));
  assert.equal(result.checkpoint.toolEvents.length, 8);
  assert(!JSON.stringify(checkpoints).includes('PRIVATE NOT STORED'));
  assert(!JSON.stringify(checkpoints).includes('private-test-capability'));
  assert.equal(events.filter((e) => e.type === 'tool-result').length, 4);
  const next = new CodexRpc((r) => codexFinish(r, 'Sentido alterado.'));
  await runCodex(next, {
    input: { ...input, digest: 'feedback', description: 'Use outro sentido', baseRevisionId: 'r2' },
    messages: result.messages,
  });
  assert.match(
    next.calls.find((c) => c.method === 'turn/start').params.input[0].text,
    /Use outro sentido/,
  );
});

test('Codex duplicate completion is idempotent; malformed args remain error evidence and foreign tools terminate', async () => {
  const rpc = new CodexRpc((r) => {
    const result = { isError: true, content: [{ type: 'text', text: 'INVALID_TOOL_ARGUMENTS' }] };
    codexTool(r, 'bad', 'scratch_create', { unknown: true }, result);
    r.emit('item/completed', {
      item: {
        type: 'mcpToolCall',
        id: 'bad',
        server: 'studio_authoring',
        tool: 'scratch_create',
        arguments: { unknown: true },
        result,
      },
    });
    codexTool(r, 'fixed', 'scratch_create', { query: 'fixed' });
    codexFinish(r);
  });
  const result = await runCodex(rpc);
  assert.equal(result.checkpoint.toolEvents.filter((e) => e.type === 'tool-result').length, 2);
  assert.match(result.checkpoint.toolEvents[0].argumentsError, /desconhecida/);
  const foreign = new CodexRpc((r) => {
    r.emit('item/started', {
      item: { type: 'mcpToolCall', id: 'x', server: 'foreign', tool: 'shell', arguments: {} },
    });
    codexFinish(r);
  });
  await assert.rejects(runCodex(foreign), { code: 'UNKNOWN_TOOL' });
  assert.equal(foreign.closed, true);
  const repeated = new CodexRpc((r) => {
    codexTool(r, 'same', 'scratch_create', { query: 'one' });
    codexTool(r, 'same', 'scratch_create', { query: 'two' });
    codexFinish(r);
  });
  await assert.rejects(runCodex(repeated), { code: 'TOOL_CALL_ID_REUSE' });
});

test('Codex cancellation, incomplete MCP stream and native tool attempts do not produce terminal success', async () => {
  const controller = new AbortController();
  const rpc = new CodexRpc(() => controller.abort());
  await assert.rejects(runCodex(rpc, { signal: controller.signal }), /abort|cancel/i);
  assert(rpc.calls.some((c) => c.method === 'turn/interrupt'));
  const incomplete = new CodexRpc((r) => {
    r.emit('item/started', {
      item: {
        type: 'mcpToolCall',
        id: 'pending',
        server: 'studio_authoring',
        tool: 'scratch_create',
        arguments: { query: 'word' },
      },
    });
    codexFinish(r);
  });
  await assert.rejects(runCodex(incomplete), { code: 'PROVIDER_STREAM' });
  const native = new CodexRpc((r) =>
    r.emit('item/started', { item: { type: 'commandExecution', id: 'shell' } }),
  );
  await assert.rejects(runCodex(native), { code: 'TOOL_SCOPE' });
});

test('RPC malformed JSON fails explicitly and tool argument validation rejects schema violations', async () => {
  const rpc = new JsonLineRpc(process.execPath, [
    '-e',
    'process.stdout.write("not-json\\n");process.stdin.resume();',
  ]);
  try {
    await assert.rejects(rpc.request('never', {}, 500), /JSON inválido/);
  } finally {
    rpc.close();
  }
  assert.throws(() => validateSchema(tools[0].inputSchema, { query: 1 }), {
    code: 'INVALID_TOOL_ARGUMENTS',
  });
  const image = toolContent({
    images: [{ mimeType: 'image/png', data: 'aGVsbG8=', hash: 'saved' }],
  });
  assert.equal(image[1].type, 'image');
  assert(!image[0].text.includes('aGVsbG8='));
  assert.throws(() => validateSchema({ type: 'object' }, JSON.parse('{"__proto__":{}}')), {
    code: 'INVALID_TOOL_ARGUMENTS',
  });
  assert.doesNotThrow(() =>
    validateSchema(
      {
        type: 'object',
        properties: { constructor: { type: 'string' } },
        additionalProperties: false,
      },
      { constructor: 'Noun' },
    ),
  );
});
