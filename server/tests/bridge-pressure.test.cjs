'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const requests = [], timers = new Map();
  let now = 0, timer = 0;
  const window = { addEventListener() {}, dispatchEvent() {} };
  const sandbox = { window, crypto: { randomUUID: () => 'client' }, structuredClone,
    document: {}, navigator: {}, CustomEvent: class {}, EventSource: class {},
    Date: { now: () => now }, performance: { now: () => now }, setInterval() {},
    setTimeout(fn, ms) { const id = ++timer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => {
      if (url === '/api/me') return { ok: true, json: async () => ({ user: { id: 'user' }, csrf: 'csrf' }) };
      return new Promise(resolve => requests.push({ input: JSON.parse(options.body), resolve }));
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/bridge.js'), 'utf8'), sandbox);
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const respond = (index, status = 200, code = '', retryAfter = null) => requests[index].resolve({
    ok: status === 200, status, headers: new Headers(retryAfter === null ? {} : { 'retry-after': retryAfter }),
    json: async () => status === 200 ? { value: index } : { error: { code, message: 'busy' } },
  });
  return { invoke: window.studio.invoke, requests, respond, flush,
    async advance(ms) { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } await flush(); },
  };
}
test('coalesces identical pending reads and bounds distinct engine calls to three', async () => {
  const f = setup();
  const same = Array.from({ length: 30 }, () => f.invoke('analysis_list', { projectId: 'p' }));
  const others = Array.from({ length: 9 }, (_, id) => f.invoke('evaluate_expression', { raw: String(id) }));
  await f.flush(); assert.equal(f.requests.length, 3);
  f.respond(0); await f.flush(); assert.equal(f.requests.length, 4);
  for (let i = 1; i < 10; i++) { f.respond(i); await f.flush(); }
  await Promise.all([...same, ...others]);
  assert.equal(f.requests.filter(r => r.input.method === 'analysis_list').length, 1);
  const fresh = f.invoke('analysis_list', { projectId: 'p' }); await f.flush();
  assert.equal(f.requests.length, 11); f.respond(10); await fresh;
});
test('429 pauses queued calls; writes stay distinct and are never replayed', async () => {
  const f = setup();
  const work = Array.from({ length: 5 }, () => f.invoke('analysis_composer', { text: 'same' }).catch(e => e.code));
  await f.flush(); assert.equal(f.requests.length, 3);
  f.respond(0, 429, 'ENGINE_BUSY'); await f.flush();
  f.respond(1); f.respond(2); await f.flush(); assert.equal(f.requests.length, 3);
  await f.advance(1999); assert.equal(f.requests.length, 3);
  await f.advance(1); assert.equal(f.requests.length, 5);
  f.respond(3); f.respond(4); await Promise.all(work);
  assert.equal(f.requests.length, 5);
});

test('maintenance 503 pauses polling for Retry-After without replaying writes', async () => {
  const f = setup();
  const write = f.invoke('analysis_composer', { text: 'once' }).catch(e => e.code);
  const poll = f.invoke('analysis_list', { projectId: 'p' }).catch(e => e.code);
  await f.flush();
  f.respond(0, 503, 'UPSTREAM_UPDATING', '15');
  f.respond(1, 503, 'UPSTREAM_UPDATING', '15');
  await f.flush();
  assert.equal(await write, 'UPSTREAM_UPDATING');
  assert.equal(await poll, 'UPSTREAM_UPDATING');
  const reads = Array.from({ length: 30 }, () => f.invoke('analysis_list', { projectId: 'p' }));
  await f.flush();
  assert.equal(f.requests.length, 2, 'repeated UI polls stay queued throughout maintenance cooldown');
  await f.advance(14999);assert.equal(f.requests.length, 2);
  await f.advance(1);assert.equal(f.requests.length, 3);
  assert.equal(f.requests[2].input.method, 'analysis_list');
  f.respond(2);await Promise.all(reads);
  assert.equal(f.requests.filter(r => r.input.method === 'analysis_composer').length, 1);
});

test('server errors retain structured freshness codes without a native serialization marker', async () => {
  const f = setup();
  const rejected = assert.rejects(f.invoke('evaluate_expression', { raw: 'old' }), error => {
    assert.equal(error.code, 'STALE_ENGINE');
    assert.equal(error.status, 422);
    assert.equal(error.message, 'busy');
    return true;
  });
  await f.flush();
  f.respond(0, 422, 'STALE_ENGINE');
  await rejected;
  assert.equal(f.requests.length, 1, 'a stale evaluation is never silently replayed');
});
