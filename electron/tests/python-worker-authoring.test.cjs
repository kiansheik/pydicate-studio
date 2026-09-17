const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { PythonWorker } = require('../python-worker.cjs');

// Simulated JSONL subprocess boundary. This regression catches the real native
// integration failure where the old three-method whitelist blocked all new UI calls.
test('generic authoring operations cross the Python worker boundary and unknown methods stay blocked', async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  const instance = new PythonWorker({
    script: 'simulated-worker.py',
    stateDirectory: '/tmp/studio-contract',
    spawnProcess: () => child,
  });
  let buffer = '';
  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const request = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      child.stdout.write(
        `${JSON.stringify({ id: request.id, result: { method: request.method, params: request.params } })}\n`,
      );
    }
  });
  try {
    const methods = [
      'parse_expression',
      'evaluate_expression',
      'source_preview',
      'source_new_preview',
      'source_apply',
      'source_recover',
      'lexicon_search',
      'structure_search',
      'structure_resolve',
      'lexicon_inspect',
      'lexicon_create',
      'lexicon_update',
      'dictionary_search',
      'assistant_context',
      'reference_verify',
      'reference_approve',
      'contribution_prepare',
    ];
    for (const method of methods)
      assert.deepEqual(await instance.request(method, { passageId: 'p', revisionId: 'r' }), {
        method,
        params: { passageId: 'p', revisionId: 'r' },
      });
    await assert.rejects(instance.request('arbitrary_python_execution', {}), /desconhecida/);
    assert.equal(instance.failed, null);
  } finally {
    instance.close();
  }
});
