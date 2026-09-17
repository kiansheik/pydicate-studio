'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createLexicalNotesService } = require('../lexical-notes-service.cjs');

async function fixture(t) {
  const stateDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-lexical-notes-'));
  t.after(() => fs.rm(stateDirectory, { recursive: true, force: true }));
  const api = () => createLexicalNotesService({ stateDirectory });
  const note = {
    scope: 'entry',
    lexicalId: 'lexical:base',
    lexicalName: 'oré',
    revisionId: 'revision:a',
    expressionFingerprint: 'sha256:expression-a',
    provenance: { sourcePath: 'historic/lexicon.tu.py', line: 4 },
    fields: { meaning: 'nós, exclusivo', grammar: 'pronome', note: '' },
  };
  return { stateDirectory, api, note };
}
test('general and occurrence notes remain separate across restart with immutable revision history', async (t) => {
  const f = await fixture(t),
    api = f.api();
  const first = await api.invoke('lexical_notes_save', {
    projectId: 'p',
    note: f.note,
    expectedVersion: 0,
  });
  const occurrence = {
    ...f.note,
    scope: 'occurrence',
    sourceId: 'araujo',
    passageId: 'passage:1',
    occurrenceId: 'occurrence:1',
    fields: { meaning: 'objeto de salvar', grammar: '', note: 'revisar' },
  };
  await api.invoke('lexical_notes_save', { projectId: 'p', note: occurrence, expectedVersion: 0 });
  await api.invoke('lexical_notes_save', {
    projectId: 'p',
    note: { ...occurrence, occurrenceId: 'occurrence:2' },
    expectedVersion: 0,
  });
  const second = await f.api().invoke('lexical_notes_save', {
    projectId: 'p',
    note: {
      ...f.note,
      revisionId: 'revision:b',
      fields: { meaning: 'nós sem interlocutor', grammar: 'pronome', note: '' },
    },
    expectedVersion: first.version,
  });
  assert.equal(second.version, 2);
  assert.equal(second.history[0].fields.meaning, 'nós, exclusivo');
  const exported = await f.api().invoke('lexical_notes_export', { projectId: 'p' });
  assert.equal(exported.records.length, 3);
  assert.equal(exported.format, 'pydicate-lexical-notes');
  assert.equal(
    exported.records.find((record) => record.id === first.id).history[1].revisionId,
    'revision:b',
  );
  assert.equal(
    (await api.invoke('lexical_notes_list', { projectId: 'other-project' })).records.length,
    0,
  );
});
test('concurrent stale updates are rejected, existing notes are preserved', async (t) => {
  const f = await fixture(t),
    api = f.api();
  const requests = [1, 2].map(() =>
    api.invoke('lexical_notes_save', { projectId: 'p', note: f.note, expectedVersion: 0 }),
  );
  const results = await Promise.allSettled(requests);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(
    results.find((result) => result.status === 'rejected').reason.message,
    /outra janela/,
  );
  assert.equal(
    (await api.invoke('lexical_notes_list', { projectId: 'p' })).records[0].history.length,
    1,
  );
});
test('corrupt records and tails are never overwritten, note paths are hashed and fields bounded', async (t) => {
  const f = await fixture(t),
    api = f.api();
  await api.invoke('lexical_notes_save', {
    projectId: '../../p',
    note: f.note,
    expectedVersion: 0,
  });
  const files = await fs.readdir(f.stateDirectory);
  assert.equal(files.length, 1);
  assert.match(files[0], /^[0-9a-f]{64}\.json$/);
  const target = path.join(f.stateDirectory, files[0]);
  await fs.writeFile(target, '{ broken');
  await assert.rejects(
    api.invoke('lexical_notes_save', { projectId: '../../p', note: f.note, expectedVersion: 1 }),
    /preservado/,
  );
  assert.equal(await fs.readFile(target, 'utf8'), '{ broken');
  await assert.rejects(
    api.invoke('lexical_notes_save', {
      projectId: 'good',
      note: { ...f.note, fields: { meaning: 'a'.repeat(50_001) } },
      expectedVersion: 0,
    }),
    /grande/,
  );
  await assert.rejects(
    api.invoke('lexical_notes_save', {
      projectId: 'good',
      note: { ...f.note, scope: 'occurrence' },
      expectedVersion: 0,
    }),
    /fonte/,
  );
});
