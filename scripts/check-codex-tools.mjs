// Installed Codex/code-mode regression. Every model response comes from loopback;
// no credentials, user passages, real inference or corpus mutations are used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CodexProvider } = require('../electron/provider-codex.cjs');
const { JsonLineRpc } = require('../electron/provider-rpc.cjs');
const { createStudioMcpGateway } = require('../electron/studio-mcp-gateway.cjs');
const { tools, GUIDE } = require('../electron/scratch-service.cjs');
const { runAgent } = require('../electron/agent-runner.cjs');
const model = 'gpt-5.6-terra';
const expected = [
  'studio_guide',
  'studio_candidate_create',
  'studio_candidate_evaluate',
  'studio_candidate_propose',
];
const code = `
text(await tools.mcp__studio_authoring__studio_guide({}));
text(await tools.mcp__studio_authoring__studio_candidate_create({raw:'a'}));
text(await tools.mcp__studio_authoring__studio_candidate_evaluate({candidateId:'fixture-c',expectedRevision:'fixture-r'}));
text(await tools.mcp__studio_authoring__studio_candidate_propose({candidateId:'fixture-c',expectedRevision:'fixture-r',rationale:'fixture',uncertainties:[],translation:{text:'Pessoa.',uncertainties:[]}}));`;
const cachePath = path.join(
  process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
  'models_cache.json',
);
const cache = JSON.parse(await fs.readFile(cachePath, 'utf8'));
const metadata = cache.models.find((entry) => entry.slug === model);
assert.equal(
  metadata?.tool_mode,
  'code_mode_only',
  'This regression requires the installed code-mode-only model metadata.',
);

async function check({ disabledHost = false, partialCatalog = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-codex-toolchain-'));
  const codexHome = path.join(directory, 'codex');
  await fs.mkdir(codexHome);
  await fs.writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify(cache));
  const calls = [],
    events = [],
    requests = [];
  let transportError;
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url.startsWith('/models')) {
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ models: [metadata] }));
        return;
      }
      assert.equal(request.url, '/responses');
      assert.equal(request.method, 'POST');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      assert(requests.length <= 2, 'Unexpected extra model round');
      const item =
        requests.length === 1
          ? {
              type: 'custom_tool_call',
              id: 'fixture-tool',
              call_id: 'fixture-call',
              namespace: 'functions',
              name: 'exec',
              input: code,
            }
          : {
              type: 'message',
              id: 'fixture-message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Local fixture complete.', annotations: [] }],
            };
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const event of [
        {
          type: 'response.created',
          response: { id: 'fixture-response', status: 'in_progress', output: [] },
        },
        { type: 'response.output_item.added', output_index: 0, item },
        { type: 'response.output_item.done', output_index: 0, item },
        {
          type: 'response.completed',
          response: {
            id: 'fixture-response',
            status: 'completed',
            output: [item],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ])
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      response.end();
    } catch (error) {
      transportError = error;
      response.writeHead(500).end();
    }
  });
  const gateway = createStudioMcpGateway({
    stateDirectory: directory,
    listTools: () => (partialCatalog ? tools.slice(0, 8) : tools),
    getGuide: () => GUIDE,
    isJobActive: () => true,
    callTool: async (_job, name) => {
      calls.push(name);
      return { tool: name, id: 'fixture-c', revisionId: 'fixture-r' };
    },
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const mcp = await gateway.openScope({ jobId: 'fixture', attemptId: 'fixture' });
    const provider = new CodexProvider({
      cwd: directory,
      rpcFactory: (command, args, options) => {
        const rpc = new JsonLineRpc(
          command,
          [
            ...args,
            '-c',
            'model_provider="studio_fixture"',
            '-c',
            `model_providers.studio_fixture={name="Studio fixture",base_url="http://127.0.0.1:${server.address().port}",wire_api="responses",requires_openai_auth=false}`,
            '-c',
            'features.enable_request_compression=false',
            ...(disabledHost ? ['-c', 'features.code_mode_host=false'] : []),
          ],
          {
            ...options,
            env: {
              ...Object.fromEntries(
                Object.entries(process.env).filter(([key]) => !key.startsWith('CODEX_')),
              ),
              CODEX_HOME: codexHome,
            },
          },
        );
        const send = rpc.request.bind(rpc);
        rpc.request = (method, params, ...rest) => {
          if (disabledHost && method === 'thread/start')
            params.config['features.code_mode_host'] = false;
          return send(method, params, ...rest);
        };
        return rpc;
      },
    });
    const run = runAgent({
      provider: 'codex',
      providers: { codex: provider },
      model,
      input: { digest: 'fixture', task: 'analyze', diplomatic: 'fixture' },
      tools,
      mcp,
      budgets: { timeoutMs: 30000 },
      onEvent: async (event) => events.push(event),
    });
    if (partialCatalog) {
      await assert.rejects(run, { code: 'MCP_UNAVAILABLE' });
      assert.equal(requests.length, 0);
      assert.equal(calls.length, 0);
    } else {
      const result = await run;
      assert.equal(result.text, 'Local fixture complete.');
      assert.equal(requests.length, 2);
      const output = requests[1].input.filter((item) => item.type === 'custom_tool_call_output');
      assert.equal(output.length, 1);
      if (disabledHost) {
        assert.match(JSON.stringify(output), /code-mode host is disabled/);
        assert.equal(calls.length, 0);
      } else {
        assert.deepEqual(calls, expected);
        assert.deepEqual(
          events.filter((event) => event.type === 'tool-result').map((event) => event.tool),
          expected,
        );
        assert(!JSON.stringify(output).includes('code-mode host is disabled'));
      }
    }
    if (transportError) throw transportError;
    return {
      mode: partialCatalog
        ? 'incomplete-catalog'
        : disabledHost
          ? 'disabled-host-reproduction'
          : 'fixed-host',
      localModelRequests: requests.length,
      studioCalls: calls.length,
      paidRequests: 0,
    };
  } finally {
    await gateway.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
for (const options of [{ disabledHost: true }, { partialCatalog: true }, {}])
  console.log(JSON.stringify(await check(options)));
