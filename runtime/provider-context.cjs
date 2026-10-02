const path = require('node:path');
const { JsonLineRpc } = require('./provider-rpc.cjs');

const AUTHORING_TOOLS = new Set([
  'get_source_context',
  'search_lexicon',
  'search_rendered_expressions',
  'render_candidate',
]);

/** Uses the existing authoring MCP, in a fresh process to avoid cached engine modules. */
async function authoringContext(context, request, options = {}) {
  const { signal } = options;
  if (signal?.aborted) throw new Error('Solicitação cancelada.');
  if (!context.corpusPath || !context.enginePath)
    return {
      state: 'unavailable',
      diagnostic: 'O projeto não forneceu caminhos locais para o MCP de autoria.',
    };
  const pythonpath = [
    context.corpusPath,
    path.join(context.enginePath, 'pydicate'),
    path.join(context.enginePath, 'tupi'),
    process.env.PYTHONPATH,
  ]
    .filter(Boolean)
    .join(path.delimiter);
  const rpc = new JsonLineRpc(
    context.python || process.env.PYDICATE_PYTHON || 'python3',
    ['-B', '-u', '-m', 'authoring.mcp_server'],
    {
      cwd: context.corpusPath,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: pythonpath },
      ...options,
    },
  );
  const calls = [];
  const abort = () => rpc.close();
  signal?.addEventListener('abort', abort, { once: true });
  async function call(name, args) {
    if (!AUTHORING_TOOLS.has(name)) throw new Error('Ferramenta MCP não permitida.');
    const result = await rpc.request('tools/call', { name, arguments: args }, 25_000, signal);
    calls.push({
      tool: name,
      arguments: args,
      ok: !result.isError,
      result: result.structuredContent || result.content,
    });
  }
  try {
    await rpc.request(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'pydicate-studio', version: '0.2.0' },
      },
      15_000,
      signal,
    );
    rpc.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const source = context.sourceId || request.context?.sourceId;
    const ordinal = context.ordinal || request.context?.ordinal;
    // An unsaved passage has only a planned ordinal. Its actual draft and
    // preceding source context already come from Studio's bounded interpreter;
    // do not ask upstream for a reference row that has not been published.
    if (source && ordinal && !context.pending)
      await call('get_source_context', { source, record_id: ordinal, radius: 2 });
    // The whole-source import can fail upstream; each requested tool records its own result.
    const reference = request.context?.selectedLexicalReference;
    if (reference && /^[\p{L}_][\p{L}\p{N}_]*$/u.test(reference))
      await call('search_lexicon', { query: reference, limit: 8 });
    return {
      state: calls.some((item) => item.ok) ? 'available' : 'blocked',
      protocol: '2024-11-05',
      server: 'oldtupi-authoring',
      calls,
    };
  } catch (error) {
    if (signal?.aborted) throw new Error('Solicitação cancelada.');
    return { state: 'blocked', diagnostic: error.message, calls };
  } finally {
    signal?.removeEventListener('abort', abort);
    rpc.close();
  }
}

module.exports = { authoringContext, AUTHORING_TOOLS };
