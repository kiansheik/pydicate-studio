'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createStudio } = require('../studio.cjs');

test('hosted refresh replaces a failed worker even when the project fingerprint is unchanged', async t => {
    const workers = [];
    const project = { id: 'project:worker-fixture', name: 'Worker fixture', mode: 'local',
        engineFingerprint: 'engine:unchanged', diagnostics: [], repositories: [], passages: [],
        sources: [{ id: 'source', title: 'Source', year: '', fileName: 'source.tu.py', passageCount: 0 }] };
    let failNextOpen = false, seeds = 0;
    t.mock.method(require('../../electron/python-worker.cjs'), 'PythonWorker', function () {
        const failOpen = failNextOpen;
        failNextOpen = false;
        const worker = {
            id: workers.length + 1, failed: null, closed: false,
            async request(method) {
                if (this.failed) throw this.failed;
                if (method === 'open_project') {
                    if (failOpen) throw new Error('candidate open failed');
                    return structuredClone(project);
                }
                return { workerId: this.id };
            },
            close() { this.closed = true; this.failed ||= new Error('closed'); },
        };
        workers.push(worker);
        return worker;
    });
    t.mock.method(require('../../electron/next-service.cjs'), 'createNextService', options => ({
        invoke: (method, params) => options.getWorker().request(method, params),
        close: async () => {}, hasWork: () => false,
    }));
    const user = { id: 'admin', role: 'admin' }, context = { user, clientId: 'tab' };
    const store = { db: {}, context: {}, now: Date.now, assertUser: async () => user,
        audit: async () => {}, seed: async () => { seeds++; } };
    const runtime = await createStudio({ python: 'fixture-python', applicationDirectory: path.resolve(__dirname, '../..'),
        stateDirectory: '/unused-worker-fixture', parent: '/unused-project', origin: 'https://fixture.invalid',
        claudeHomeDirectory: '/unused-claude-fixture' }, store);
    t.after(() => runtime.close());
    assert.equal((await runtime.invoke('lexicon_search', {}, context)).workerId, 1);
    await runtime.refresh(context);
    assert.equal(workers[1].closed, true, 'A healthy current worker keeps its caches.');
    assert.equal(workers[0].closed, false);
    workers[0].failed = Object.assign(new Error('invalid JSON transport'), { code: 'WORKER_UNAVAILABLE' });
    await runtime.refresh(context);
    assert.equal(workers[0].closed, true);
    assert.equal(workers[2].closed, false);
    assert.equal((await runtime.invoke('lexicon_search', {}, context)).workerId, 3);
    assert.equal(seeds, 1, 'Worker recovery must not reseed collaborative drafts.');
    failNextOpen = true;
    await assert.rejects(runtime.refresh(context), /candidate open failed/);
    assert.equal(workers[3].closed, true);
    assert.equal(workers[2].closed, false, 'A failed candidate must not discard the working engine.');
    assert.equal((await runtime.invoke('lexicon_search', {}, context)).workerId, 3);
});
