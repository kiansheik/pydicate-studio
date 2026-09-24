const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DraftStore } = require('../draft-store.cjs');
const validate = require('../validation.cjs');

const analysis = {
  kind: 'imperative',
  predicate: 'apiti',
  subject: 'nde',
  object: 'moro',
  hiddenSubject: true,
  mood: 'imperative',
  negated: true,
};
function envelope(notes = 'Leitura incerta.') {
  return {
    version: 1,
    projectId: 'example:araujo-0067',
    drafts: {
      'passage:67': {
        passageId: 'passage:67',
        revisionId: 'revision:1',
        sourceFingerprint: 'source:1',
        diplomatic: '',
        normalized: '',
        translation: '',
        notes,
        analysis,
        updatedAt: '2026-09-16T15:00:00.000Z',
      },
    },
  };
}

async function store(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-drafts-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new DraftStore(directory);
}

test('drafts save and reopen without adding reference or editorial acceptance', async (t) => {
  const drafts = await store(t);
  const value = envelope();
  assert.equal(await drafts.load(value.projectId), null);
  await drafts.save(value);
  const reopened = new DraftStore(drafts.directory);
  assert.deepEqual(await reopened.load(value.projectId), value);
  assert.deepEqual(await fs.readdir(drafts.directory), [
    path.basename(drafts.filename(value.projectId)),
  ]);
});

test('corrupt drafts are surfaced and preserved when autosave tries to replace them', async (t) => {
  const drafts = await store(t);
  const value = envelope();
  const filename = drafts.filename(value.projectId);
  await fs.writeFile(filename, '{damaged text');
  await assert.rejects(drafts.load(value.projectId), /preservado para recuperação/);
  await assert.rejects(drafts.save(value), /preservado para recuperação/);
  assert.equal(await fs.readFile(filename, 'utf8'), '{damaged text');
});

test('serialized saves preserve latest edit and hash project identities into fixed filenames', async (t) => {
  const drafts = await store(t);
  await Promise.all([
    drafts.save(envelope('Primeira nota.')),
    drafts.save(envelope('Segunda nota.')),
  ]);
  assert.equal(
    (await drafts.load('example:araujo-0067')).drafts['passage:67'].notes,
    'Segunda nota.',
  );
  assert.match(path.basename(drafts.filename('project:with/unusual/name')), /^[a-f0-9]{64}\.json$/);
  assert.equal(path.dirname(drafts.filename('project:with/unusual/name')), drafts.directory);
});

test('draft and render contracts reject unsupported analysis and approval-shaped fields', () => {
  assert.throws(() => validate.envelope({ ...envelope(), approved: true }), /Dados inválidos/);
  const value = envelope();
  value.drafts['passage:67'].passageId = 'different-passage';
  assert.throws(() => validate.envelope(value), /Dados inválidos/);
  assert.throws(
    () =>
      validate.renderRequest({
        revisionId: 'r1',
        engineFingerprint: 'e1',
        analysis: { ...analysis, predicate: 'other' },
      }),
    /Dados inválidos/,
  );
  assert.throws(
    () =>
      validate.renderRequest({
        revisionId: 'r1',
        engineFingerprint: 'e1',
        analysis,
        expression: 'custom source',
      }),
    /Dados inválidos/,
  );
  assert.deepEqual(
    validate.renderRequest({ revisionId: 'r1', engineFingerprint: 'e1', analysis }),
    { revisionId: 'r1', engineFingerprint: 'e1', analysis },
  );
});

test('empty imports are rejected before switching a reading desk that requires a passage', () => {
  assert.throws(
    () =>
      validate.project({
        id: 'project:empty',
        name: 'Empty import',
        mode: 'local',
        passages: [],
        repositories: [],
        engineFingerprint: 'engine:1',
        diagnostics: [],
      }),
    /Dados inválidos em passagens/,
  );
});

test('PT and EN draft translations persist independently without relabelling legacy text', async (t) => {
  const drafts = await store(t);
  const value = envelope();
  value.drafts['passage:67'].translation = 'unlabelled';
  value.drafts['passage:67'].translations = { pt: '  primeira\n\nsegunda ', en: 'first\nsecond' };
  await drafts.save(value);
  assert.deepEqual(
    (await drafts.load(value.projectId)).drafts['passage:67'].translations,
    value.drafts['passage:67'].translations,
  );
  value.drafts['passage:67'].translations.pt = '';
  await drafts.save(value);
  const reopened = (await drafts.load(value.projectId)).drafts['passage:67'];
  assert.equal(reopened.translation, 'unlabelled');
  assert.deepEqual(reopened.translations, { pt: '', en: 'first\nsecond' });
  for (const invalid of [{ pt: 3 }, { fr: 'bonjour' }, null]) {
    value.drafts['passage:67'].translations = invalid;
    assert.throws(() => validate.envelope(value));
  }
});
