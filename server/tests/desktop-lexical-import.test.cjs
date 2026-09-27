'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createLexicalNotesService, identity } = require('../../electron/lexical-notes-service.cjs');
const { importDesktopLexicalNotes } = require('../desktop-lexical-import.cjs');
const sha = (value) => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-lexical-import-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const directory = path.join(base, 'archive'),
    stateDirectory = path.join(base, 'hosted');
  const source = createLexicalNotesService({
    stateDirectory: path.join(directory, 'files/lexical-notes'),
  });
  const target = createLexicalNotesService({
    stateDirectory: path.join(stateDirectory, 'lexical-notes'),
  });
  const entry = {
    scope: 'entry',
    lexicalId: 'lexical:taba',
    lexicalName: 'taba',
    revisionId: 'original-revision',
    expressionFingerprint: 'syntax-v1:original',
    fields: { meaning: 'aldeia', grammar: 'nome', note: 'Comentário da autora' },
    provenance: { origin: 'human' },
  };
  const occurrence = {
    ...entry,
    scope: 'occurrence',
    passageId: 'old:one',
    sourceId: 'fonte',
    occurrenceId: 'root',
    nodeFingerprint: 'node-v1:exact',
  };
  for (const note of [entry, occurrence])
    await source.invoke('lexical_notes_save', { projectId: 'desktop', note, expectedVersion: 0 });
  await source.invoke('lexical_notes_save', {
    projectId: 'desktop',
    note: { ...occurrence, fields: { ...occurrence.fields, note: 'Interpretação revisada' } },
    expectedVersion: 1,
  });
  const relative = 'files/lexical-notes/' + sha('desktop') + '.json';
  const original = await fs.readFile(path.join(directory, relative));
  const args = {
    directory,
    stateDirectory,
    manifest: {
      version: 1,
      projectId: 'desktop',
      files: [{ path: relative, sha256: sha(original) }],
    },
    receipt: {
      sourceProjectId: 'desktop',
      projectId: 'hosted',
      passageMappings: { 'old:one': 'passage:new' },
    },
    project: {
      id: 'hosted',
      passages: [
        {
          id: 'passage:new',
          sourceId: 'fonte',
          expressionFingerprint: 'syntax-v1:original',
          sourceExpression: 'taba',
        },
      ],
    },
    drafts: {},
  };
  return { args, original, target, entry, occurrence, relative };
}

test('restores valid notes and exact histories, maps occurrence identity, and is idempotent', async (t) => {
  const f = await fixture(t);
  const result = await importDesktopLexicalNotes(f.args);
  assert.deepEqual(result.counts, { inspected: 2, imported: 2, unchanged: 0, conflicts: 0 });
  const saved = (await f.target.invoke('lexical_notes_list', { projectId: 'hosted' })).records;
  const original = JSON.parse(f.original).records;
  assert.deepEqual(saved[0], original[0]);
  assert.deepEqual(saved[1], {
    ...original[1],
    id: identity({ ...original[1], passageId: 'passage:new' }),
    passageId: 'passage:new',
  });
  assert.deepEqual(saved[1].history, original[1].history);
  assert.deepEqual(await fs.readFile(path.join(f.args.directory, f.relative)), f.original);
  assert.equal((await importDesktopLexicalNotes(f.args)).counts.unchanged, 2);
});

test('preserves existing online edits and archives changed or unverified occurrence expressions', async (t) => {
  const f = await fixture(t);
  await f.target.invoke('lexical_notes_save', {
    projectId: 'hosted',
    note: { ...f.entry, fields: { note: 'Edição online' } },
    expectedVersion: 0,
  });
  f.args.drafts['passage:new'] = { raw: 'outra_leitura' };
  const result = await importDesktopLexicalNotes(f.args);
  assert.equal(result.counts.imported, 0);
  assert.deepEqual(
    result.conflicts.map((item) => item.reason),
    ['existing-note-differs', 'changed-or-unverified-expression'],
  );
  const notes = await f.target.invoke('lexical_notes_list', { projectId: 'hosted' });
  assert.equal(notes.records.length, 1);
  assert.equal(notes.records[0].fields.note, 'Edição online');
  delete f.args.drafts;
  assert.equal((await importDesktopLexicalNotes(f.args)).counts.conflicts, 2);
});

test('does not import an orphan occurrence and rejects modified archives before writing', async (t) => {
  const f = await fixture(t);
  f.args.receipt.passageMappings = {};
  const result = await importDesktopLexicalNotes(f.args);
  assert.equal(result.counts.imported, 1);
  assert.equal(result.conflicts[0].reason, 'unresolved-passage');
  await fs.appendFile(path.join(f.args.directory, f.relative), ' ');
  await assert.rejects(importDesktopLexicalNotes(f.args), /checksum/);
  assert.equal(
    (await f.target.invoke('lexical_notes_list', { projectId: 'hosted' })).records.length,
    1,
  );
});

test('never replaces an unreadable active notebook', async (t) => {
  const f = await fixture(t),
    directory = path.join(f.args.stateDirectory, 'lexical-notes');
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, sha('hosted') + '.json');
  await fs.writeFile(file, '{ unfinished');
  await assert.rejects(importDesktopLexicalNotes(f.args));
  assert.equal(await fs.readFile(file, 'utf8'), '{ unfinished');
});

test('reconciles legacy Python fingerprints and moved lexical/node identities only with proven declarations and source nodes', async (t) => {
  const f = await fixture(t);
  const notebook = JSON.parse(f.original);
  for (const note of notebook.records)
    note.provenance = {
      entry: {
        sourcePath: '/desktop/oldtupicorpus/historic/lexicon.tu.py',
        runtimeModule: 'lexicon',
        declarationFingerprint: 'sha256:declaration',
      },
      ...(note.scope === 'occurrence'
        ? { occurrence: { id: note.occurrenceId, sourceNodeId: 'root/left' } }
        : {}),
    };
  const bytes = Buffer.from(JSON.stringify(notebook));
  await fs.writeFile(path.join(f.args.directory, f.relative), bytes);
  f.args.manifest.files[0].sha256 = sha(bytes);
  f.args.manifest.project = {
    passages: [
      {
        id: 'old:one',
        sourceExpression: 'taba',
        expressionFingerprint: 'other-adapter-fingerprint',
        legacyExpressionFingerprint: 'syntax-v1:original',
      },
    ],
  };
  f.args.project.passages[0].expressionFingerprint = 'syntax-v1:hosted';
  f.args.inspectLexicon = async () => ({
    expressionFingerprint: 'syntax-v1:hosted',
    engineFingerprint: 'hosted-engine',
    entries: [
      {
        id: 'lexical:new',
        name: 'taba',
        provenance: {
          sourcePath: '/srv/repos/oldtupicorpus/historic/lexicon.tu.py',
          runtimeModule: 'lexicon',
          declarationFingerprint: 'sha256:declaration',
        },
      },
    ],
    occurrences: [
      {
        id: 'occurrence:new',
        noteOccurrenceId: 'node-occurrence:new',
        lexicalId: 'lexical:new',
        sourceNodeId: 'root/left',
        nodeFingerprint: 'node:new',
      },
    ],
  });
  const result = await importDesktopLexicalNotes(f.args);
  assert.equal(result.counts.imported, 2);
  const saved = (await f.target.invoke('lexical_notes_list', { projectId: 'hosted' })).records;
  assert.equal(saved[0].lexicalId, 'lexical:new');
  assert.equal(saved[1].occurrenceId, 'node-occurrence:new');
  assert.equal(saved[1].nodeFingerprint, 'node:new');
  assert.equal(saved[1].expressionFingerprint, 'syntax-v1:hosted');
  assert.equal(
    saved[1].provenance.desktopImport.originalOccurrenceId,
    notebook.records[1].occurrenceId,
  );
  assert.deepEqual(saved[1].history, notebook.records[1].history);
  assert.equal((await importDesktopLexicalNotes(f.args)).counts.unchanged, 2);
  f.args.receipt.snapshotSha256 = 'b'.repeat(64);
  assert.equal((await importDesktopLexicalNotes(f.args)).counts.unchanged, 2);
  assert.deepEqual(
    (await f.target.invoke('lexical_notes_list', { projectId: 'hosted' })).records,
    saved,
  );
  f.args.inspectLexicon = async () => ({
    entries: [
      {
        id: 'lexical:new',
        name: 'taba',
        provenance: {
          sourcePath: '/srv/repos/oldtupicorpus/historic/lexicon.tu.py',
          runtimeModule: 'lexicon',
          declarationFingerprint: 'sha256:changed',
        },
      },
    ],
  });
  assert.equal((await importDesktopLexicalNotes(f.args)).counts.conflicts, 2);
  // A declaration reformatted by Black is accepted only after both versions
  // pass the current parser and yield the same literal/comment-aware identity.
  for (const note of notebook.records) note.provenance.expression = 'N("taba")';
  const reformatted = Buffer.from(JSON.stringify(notebook));
  await fs.writeFile(path.join(f.args.directory, f.relative), reformatted);
  f.args.manifest.files[0].sha256 = sha(reformatted);
  f.args.inspectLexicon = async () => ({
    expressionFingerprint: 'syntax-v1:hosted',
    entries: [
      {
        id: 'lexical:new',
        name: 'taba',
        expression: 'N( "taba" )',
        provenance: {
          sourcePath: '/srv/repos/oldtupicorpus/historic/lexicon.tu.py',
          runtimeModule: 'lexicon',
          declarationFingerprint: 'sha256:formatted',
        },
      },
    ],
    occurrences: [
      {
        id: 'occurrence:new',
        noteOccurrenceId: 'node-occurrence:new',
        lexicalId: 'lexical:new',
        sourceNodeId: 'root/left',
        nodeFingerprint: 'node:new',
      },
    ],
  });
  f.args.inspectExpression = async (raw) => ({ expressionFingerprint: raw.replaceAll(' ', '') });
  // Existing notes differ in recorded import provenance, so they stay preserved;
  // only the declaration-matching stage must now succeed.
  assert.deepEqual(
    (await importDesktopLexicalNotes(f.args)).conflicts.map((item) => item.reason),
    ['existing-note-differs', 'existing-note-differs'],
  );
  f.args.inspectExpression = async (raw) => ({ expressionFingerprint: raw });
  assert.deepEqual(
    (await importDesktopLexicalNotes(f.args)).conflicts.map((item) => item.reason),
    ['unresolved-lexical-identity', 'unresolved-lexical-identity'],
  );
});
