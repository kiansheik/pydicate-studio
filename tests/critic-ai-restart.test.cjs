const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createProviderService } = require('../electron/provider-service.cjs');

// Independent Round 3 tests. Every provider and context transport is local and
// synthetic. No account, network, real corpus, or upstream repository is used.
const request = {
  requestId: 'critic-interrupted-request',
  provider: 'claude',
  action: 'translate',
  projectId: 'critic-synthetic-project',
  passageId: 'critic-synthetic-passage',
  revisionId: 'critic-original-revision',
  context: { raw: 'synthetic_lexeme', description: 'Synthetic restart test only.' },
};
const partial = '{"translation":"synthetic partial';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const recordFile = (directory, id = request.requestId) =>
  path.join(
    directory,
    'ai',
    digest(request.projectId),
    digest(request.passageId),
    `${digest(id)}.json`,
  );

function localService(directory, events = []) {
  const provider = {
    status: async () => ({ state: 'available', detail: 'Synthetic local transport.' }),
    run: async ({ onDelta }) => {
      onDelta('{"translation":"synthetic retry completed","regressions":[]}');
      return { providerResponseId: 'synthetic-local-response', model: 'synthetic-local-model' };
    },
  };
  return createProviderService({
    stateDirectory: directory,
    adapters: { codex: provider, claude: provider },
    env: {},
    getContext: async () => ({ fixture: 'synthetic local context' }),
    contextLoader: async () => ({ state: 'synthetic', references: [] }),
    emit: (event) => events.push(event),
    timeoutMs: 10_000,
  });
}

async function eventually(read, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

async function directoryFor(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-critic-ai-restart-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('a killed service recovers its actual partial checkpoint and retries under a distinct identity', async (t) => {
  const directory = await directoryFor(t);
  const childSource = `
    const { createProviderService } = require(process.argv[1]);
    const request = JSON.parse(process.argv[3]);
    const provider = {
      status: async () => ({ state: 'available' }),
      run: ({ onDelta, signal }) => new Promise((resolve, reject) => {
        onDelta(process.argv[4]);
        signal.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true });
      }),
    };
    const service = createProviderService({
      stateDirectory: process.argv[2],
      adapters: { codex: provider, claude: provider },
      env: {},
      getContext: async () => ({ fixture: 'synthetic local context' }),
      contextLoader: async () => ({ state: 'synthetic', references: [] }),
      timeoutMs: 30000,
    });
    service.handle('ai_start', request).catch(error => {
      process.stderr.write(error.stack); process.exitCode = 1;
    });
  `;
  const child = spawn(
    process.execPath,
    [
      '-e',
      childSource,
      path.resolve(__dirname, '../electron/provider-service.cjs'),
      directory,
      JSON.stringify(request),
      partial,
    ],
    { env: {}, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
  });
  const checkpoint = await eventually(async () => {
    try {
      const bytes = await fs.readFile(recordFile(directory), 'utf8');
      const record = JSON.parse(bytes);
      return record.status === 'streaming' && record.text === partial ? { bytes, record } : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }, `No real on-disk partial checkpoint appeared. Child stderr: ${stderr}`);
  assert.equal(checkpoint.record.revisionId, request.revisionId);
  assert.equal(
    checkpoint.record.inputContext.authoritativeProject.fixture,
    'synthetic local context',
  );
  assert.match(checkpoint.record.inputHash, /^[a-f0-9]{64}$/);

  // Kill only the child created by this test, after its real atomic write completed.
  assert.equal(child.kill('SIGKILL'), true);
  const [code, signal] = await exited;
  assert.equal(code, null);
  assert.equal(signal, 'SIGKILL');
  assert.equal(stderr, '');

  const events = [];
  const restarted = localService(directory, events);
  t.after(() => restarted.close());
  const [recovered] = await restarted.handle('ai_history', request);
  for (const key of ['projectId', 'passageId', 'revisionId', 'requestId'])
    assert.equal(recovered[key], request[key]);
  assert.equal(recovered.text, partial);
  assert.equal(recovered.status, 'failed');
  assert.match(recovered.error, /fechou antes da conclusão/);
  assert.equal(recovered.editorialApproval, null);
  assert.deepEqual(recovered.acceptances, []);
  assert.deepEqual(recovered.context, request.context);
  assert.equal(await fs.readFile(recordFile(directory), 'utf8'), checkpoint.bytes);

  await assert.rejects(restarted.handle('ai_start', request), /já utilizado/);
  const retry = {
    ...request,
    requestId: 'critic-retry-request',
    revisionId: 'critic-current-revision',
  };
  await restarted.handle('ai_start', retry);
  const completed = await eventually(
    () =>
      events.find((event) => event.requestId === retry.requestId && event.status === 'completed'),
    'Synthetic retry did not complete.',
  );
  assert.equal(completed.revisionId, retry.revisionId);
  assert.equal(completed.result.suggestion.translation, 'synthetic retry completed');
  assert.equal(completed.result.providerResponseId, 'synthetic-local-response');
  assert.equal(completed.result.editorialApproval, null);
  const history = await restarted.handle('ai_history', request);
  assert.equal(history.length, 2);
  assert.equal(history.find((item) => item.requestId === request.requestId).text, partial);
  assert.equal(history.find((item) => item.requestId === retry.requestId).status, 'completed');
  await assert.rejects(
    restarted.handle('ai_accept', {
      ...request,
      requestId: retry.requestId,
      kind: 'translation',
      text: 'synthetic retry completed',
    }),
    /outra revisão/,
  );
});

test('malformed JSON history is reported and preserves the exact original bytes', async (t) => {
  const directory = await directoryFor(t);
  const filename = recordFile(directory);
  const bytes = Buffer.from('{"version":1,"text":"unclosed synthetic record');
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, bytes);
  const service = localService(directory);
  t.after(() => service.close());
  await assert.rejects(service.handle('ai_history', request), SyntaxError);
  assert.deepEqual(await fs.readFile(filename), bytes);
});

test('structurally corrupt JSON history is reported without manufacturing a completed result', async (t) => {
  const directory = await directoryFor(t);
  const filename = recordFile(directory);
  const bytes = Buffer.from(
    JSON.stringify({
      version: 1,
      requestId: request.requestId,
      projectId: request.projectId,
      passageId: request.passageId,
      status: 'completed',
      text: 42,
      acceptances: 'corrupt',
    }),
  );
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, bytes);
  const service = localService(directory);
  t.after(() => service.close());
  await assert.rejects(service.handle('ai_history', request), /corrompido|inválid/i);
  assert.deepEqual(await fs.readFile(filename), bytes);
});
