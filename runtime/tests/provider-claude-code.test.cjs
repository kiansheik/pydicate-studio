'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { ClaudeCodeProvider } = require('../provider-claude-code.cjs');

/** A child process double shaped like the real binary's stream-json output. */
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), { end() {}, write() {} });
  child.kill = () => {};
  child.emitLines = (lines) => {
    for (const line of lines) child.stdout.emit('data', JSON.stringify(line) + '\n');
  };
  return child;
}

function provider(handler, { home = '/private/home' } = {}) {
  const calls = [];
  const instance = new ClaudeCodeProvider({
    resolveHome: async () => home,
    command: 'claude',
    spawnImpl: (command, args, options) => {
      const child = fakeChild();
      calls.push({ command, args, options, child });
      queueMicrotask(() => handler(child));
      return child;
    },
  });
  return { instance, calls };
}

test('a run streams text, reports usage and never inherits a substitute credential', async () => {
  const { instance, calls } = provider((child) => {
    child.emitLines([
      { type: 'system', subtype: 'init', session_id: 'session-1' },
      // Thinking must never reach the draft.
      { type: 'stream_event', event: { delta: { type: 'thinking_delta', thinking: 'hmm' } } },
      { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Bom ' } } },
      { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'dia' } } },
      {
        type: 'result',
        is_error: false,
        result: 'Bom dia',
        session_id: 'session-1',
        usage: { input_tokens: 12, output_tokens: 3 },
      },
    ]);
    child.emit('close', 0);
  });
  const deltas = [];
  const metadata = await instance.run({
    model: 'claude-sonnet-5',
    prompt: 'Traduza',
    onDelta: (value) => deltas.push(value),
  });
  assert.equal(deltas.join(''), 'Bom dia');
  assert.equal(metadata.providerSessionId, 'session-1');
  assert.deepEqual(metadata.usage, { inputTokens: 12, outputTokens: 3 });

  const { args, options } = calls[0];
  // The subscription must be the only credential in play.
  for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'])
    assert.equal(options.env[name], undefined);
  assert.equal(options.env.CLAUDE_CONFIG_DIR, '/private/home');
  assert.equal(options.cwd, '/private/home');
  // No MCP server, no tools, and never --bare, which would force API-key auth.
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(args[args.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
  assert.ok(args.includes('Bash') && args.includes('WebFetch'));
  assert.ok(!args.includes('--bare'));
  assert.equal(args[args.indexOf('--model') + 1], 'claude-sonnet-5');
});

test('the final result supplies the text when no partial deltas arrive', async () => {
  const { instance } = provider((child) => {
    child.emitLines([
      { type: 'system', subtype: 'init', session_id: 's' },
      { type: 'result', is_error: false, result: 'Resposta completa' },
    ]);
    child.emit('close', 0);
  });
  const deltas = [];
  await instance.run({ model: '', prompt: 'x', onDelta: (value) => deltas.push(value) });
  assert.equal(deltas.join(''), 'Resposta completa');
});

test('a reported error and an unstarted binary both surface instead of looking empty', async () => {
  const failing = provider((child) => {
    child.emitLines([
      { type: 'system', subtype: 'init', session_id: 's' },
      { type: 'result', is_error: true, result: 'Limite de uso atingido' },
    ]);
    child.emit('close', 1);
  });
  await assert.rejects(
    () => failing.instance.run({ model: '', prompt: 'x', onDelta: () => {} }),
    /Limite de uso atingido/,
  );

  const broken = provider((child) => {
    child.stderr.emit('data', 'claude: command failed');
    child.emit('close', 127);
  });
  await assert.rejects(
    () => broken.instance.run({ model: '', prompt: 'x', onDelta: () => {} }),
    /command failed/,
  );
});

test('status reports the signed-in account and refuses to guess when signed out', async () => {
  const out = provider((child) => {
    child.stdout.emit('data', JSON.stringify({ loggedIn: false }));
    child.emit('close', 0);
  });
  const signedOut = await out.instance.status('claude-sonnet-5');
  assert.equal(signedOut.state, 'unconfigured');
  assert.equal(signedOut.id, 'claude-code');

  const inside = provider((child) => {
    child.stdout.emit('data', JSON.stringify({ loggedIn: true, email: 'pessoa@exemplo.org' }));
    child.emit('close', 0);
  });
  const signedIn = await inside.instance.status('claude-sonnet-5');
  assert.equal(signedIn.state, 'authenticated');
  assert.match(signedIn.detail, /pessoa@exemplo\.org/);

  // An unconfigured home is a configuration problem, not a crash.
  const unset = new ClaudeCodeProvider({
    resolveHome: async () => {
      throw new Error('A administração ainda não configurou o login do Claude.');
    },
  });
  assert.equal((await unset.status('m')).state, 'unconfigured');
});
