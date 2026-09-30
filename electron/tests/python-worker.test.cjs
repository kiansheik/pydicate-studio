const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { PythonWorker } = require('../python-worker.cjs');

function worker(options = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    child.killed = true;
    return true;
  };
  const instance = new PythonWorker({
    script: 'worker.py',
    stateDirectory: '/tmp/studio-state',
    spawnProcess: () => child,
    ...options,
  });
  return { instance, child };
}

test('worker correlates responses and preserves split UTF-8 text', async () => {
  const { instance, child } = worker();
  const first = instance.request('refresh_project', {});
  const second = instance.request('render', {});
  const bytes = Buffer.from(JSON.stringify({ id: 2, result: { surface: 'umẽ' } }) + '\n');
  const split = bytes.indexOf(Buffer.from('ẽ')) + 1;
  child.stdout.write(bytes.subarray(0, split));
  child.stdout.write(bytes.subarray(split));
  child.stdout.write(JSON.stringify({ id: 1, result: { project: true } }) + '\n');
  assert.deepEqual(await first, { project: true });
  assert.deepEqual(await second, { surface: 'umẽ' });
  instance.close();
});

test('worker exits reject every pending request and future use', async () => {
  const { instance, child } = worker();
  const first = assert.rejects(instance.request('open_project', {}), /encerrou/);
  const second = assert.rejects(instance.request('render', {}), /encerrou/);
  child.emit('close', 1, null);
  await Promise.all([first, second]);
  await assert.rejects(instance.request('refresh_project', {}), /encerrou/);
  assert.equal(instance.pending.size, 0);
});

test('timeouts stop the service and reject all waiters', async () => {
  const { instance, child } = worker({ timeout: 10 });
  const first = assert.rejects(instance.request('open_project', {}), /demorou além/);
  const second = assert.rejects(instance.request('render', {}), /demorou além/);
  await Promise.all([first, second]);
  assert.equal(child.killed, true);
  assert.equal(instance.pending.size, 0);
});

test('a partial oversized response is bounded without waiting for a newline', async () => {
  const { instance, child } = worker({ maxLineBytes: 64 });
  const result = assert.rejects(instance.request('refresh_project', {}), /excedeu o limite/);
  child.stdout.write('x'.repeat(65));
  await result;
  assert.equal(child.killed, true);
});

test('structured Python errors do not destroy a usable worker', async () => {
  const { instance, child } = worker();
  const first = assert.rejects(instance.request('render', {}), /Motor mudou/);
  child.stdout.write(
    JSON.stringify({ id: 1, error: { code: 'stale_engine', message: 'Motor mudou.' } }) + '\n',
  );
  await first;
  const second = instance.request('refresh_project', {});
  child.stdout.write(JSON.stringify({ id: 2, result: {} }) + '\n');
  assert.deepEqual(await second, {});
  assert.equal(instance.failed, null);
  instance.close();
});

test('invalid JSON reports bounded parse diagnostics and byte length without dumping the middle of a project', async () => {
  const { instance, child } = worker();
  const line =
    '{"id":1,"result":{"surface":"' +
    'ẽ'.repeat(600) +
    'PRIVATE_MIDDLE_MARKER' +
    'x'.repeat(600) +
    '","tail":BROKEN_JSON}}';
  let parseMessage;
  try {
    JSON.parse(line);
  } catch (error) {
    parseMessage = error.message;
  }
  const result = assert.rejects(instance.request('open_project', {}), (error) => {
    assert.equal(error.code, 'WORKER_UNAVAILABLE');
    assert.ok(error.message.includes('JSON: ' + parseMessage.slice(0, 384)));
    assert.ok(error.message.includes('Bytes: ' + Buffer.byteLength(line, 'utf8')));
    assert.ok(error.message.includes('Final: '));
    assert.ok(error.message.includes('BROKEN_JSON'));
    assert.ok(!error.message.includes('PRIVATE_MIDDLE_MARKER'));
    assert.ok(error.message.length < 1100);
    return true;
  });
  child.stdout.write(line + '\n');
  await result;
  assert.equal(child.killed, true);
});
