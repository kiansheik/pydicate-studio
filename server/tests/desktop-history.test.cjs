'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createDesktopHistory } = require('../desktop-history.cjs');
const sha = (value) => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-history-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const snapshot = sha('snapshot'),
    base = path.join(directory, snapshot);
  const files = [];
  async function add(name, data, kind) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    const relative = 'files/' + name;
    await fs.mkdir(path.dirname(path.join(base, relative)), { recursive: true });
    await fs.writeFile(path.join(base, relative), bytes);
    files.push({ path: relative, sha256: sha(bytes), kind });
    return relative;
  }
  const job = {
    id: 'job:1',
    projectId: 'desktop',
    passageId: 'old:1',
    status: 'running',
    input: {
      projectId: 'desktop',
      passageId: 'old:1',
      digest: 'untouched-original',
      description: 'Leitura preservada',
      sourceId: 'fonte',
    },
    summary: 'Resposta preservada',
    updatedAt: '2026-09-27T12:00:00Z',
  };
  const analysis = await add(
    'analysis/records/one.json',
    {
      version: 1,
      projectId: 'desktop',
      jobs: { 'job:1': job },
      conversations: {
        thread: {
          id: 'thread',
          passageId: 'old:1',
          composer: 'Mensagem não enviada',
          turns: [
            { role: 'user', text: 'Pergunta' },
            { role: 'assistant', text: 'Resposta' },
          ],
        },
      },
      candidates: { candidate: { passageId: 'old:1', raw: 'N("taba")' } },
      candidateRevisions: { candidate: [{ passageId: 'old:1', raw: 'N("oka")' }] },
      decisions: [{ passageId: 'old:1', operationId: 'human-decision' }],
    },
    'analysis',
  );
  const drafts = await add(
    'drafts/one.json',
    {
      version: 1,
      projectId: 'desktop',
      drafts: {
        'old:1': { passageId: 'old:1', workflow: { stage: 'complete' }, raw: 'N("taba")' },
        orphan: { passageId: 'old:lost', raw: 'texto ainda não reconciliado' },
      },
    },
    'drafts',
  );
  await add(
    'lexical-notes/one.json',
    {
      version: 1,
      projectId: 'desktop',
      records: [{ passageId: 'old:1', lexicalName: 'taba', fields: { meaning: 'aldeia' } }],
    },
    'lexical-notes',
  );
  await add(
    'ai/ai/one/two/three.json',
    { projectId: 'desktop', passageId: 'old:1', text: 'Tradução antiga', status: 'complete' },
    'legacy-ai',
  );
  const image = await add(
    'analysis/images/one.png',
    Buffer.from([137, 80, 78, 71]),
    'analysis-image',
  );
  await fs.writeFile(
    path.join(base, 'manifest.json'),
    JSON.stringify({
      version: 1,
      projectId: 'desktop',
      project: { passages: [{ id: 'old:1', sourceId: 'fonte', ordinal: 3 }] },
      files,
    }),
  );
  await fs.writeFile(
    path.join(base, 'receipt.json'),
    JSON.stringify({
      version: 1,
      snapshotSha256: snapshot,
      projectId: 'hosted',
      passageMappings: { 'old:1': 'passage:current' },
      archiveMappings: { 'old:lost': 'archive:lost' },
      counts: { drafts: 2 },
    }),
  );
  return {
    directory,
    snapshot,
    base,
    analysis,
    drafts,
    image,
    job,
    reader: createDesktopHistory({ directory }),
  };
}

test('archives expose original drafts, all proposal revisions, conversations and legacy replies without running or changing them', async (t) => {
  const f = await fixture(t),
    before = await fs.readFile(path.join(f.base, f.analysis));
  const list = await f.reader.list({ projectId: 'hosted', passageId: 'passage:current' });
  assert.deepEqual(
    new Set(list.entries.map((entry) => entry.kind)),
    new Set([
      'job',
      'conversation',
      'candidate',
      'candidate-revision',
      'decision',
      'draft',
      'lexical-note',
      'legacy-ai',
    ]),
  );
  const row = list.entries.find((entry) => entry.kind === 'job');
  assert.equal(row.originalPassageId, 'old:1');
  assert.equal(row.ordinal, 3);
  assert.equal(row.status, 'running');
  const result = await f.reader.get({ projectId: 'hosted', ...row });
  assert.deepEqual(result.data, f.job);
  assert.equal(result.data.input.digest, 'untouched-original');
  assert.equal(result.relatedFiles[0].path, f.image);
  assert.deepEqual(await fs.readFile(path.join(f.base, f.analysis)), before);
  const orphan = await f.reader.list({ projectId: 'hosted', passageId: 'archive:lost' });
  assert.equal(orphan.entries.length, 1);
  assert.equal(orphan.entries[0].originalPassageId, 'old:lost');
  const revision = list.entries.find((entry) => entry.kind === 'candidate-revision');
  assert.equal((await f.reader.get({ projectId: 'hosted', ...revision })).data.raw, 'N("oka")');
});

test('history stays within the selected project and manifest files; binaries retain exact bytes', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.reader.list({ projectId: 'another' })).total, 0);
  await assert.rejects(
    f.reader.get({ projectId: 'another', snapshot: f.snapshot, path: f.analysis }),
    { code: 'DESKTOP_ARCHIVE_MISSING' },
  );
  for (const relative of ['../receipt.json', 'manifest.json', 'files/ai/ai/config.json'])
    await assert.rejects(
      f.reader.file({ projectId: 'hosted', snapshot: f.snapshot, path: relative }),
      { code: 'DESKTOP_RECORD_MISSING' },
    );
  const image = await f.reader.file({ projectId: 'hosted', snapshot: f.snapshot, path: f.image });
  assert.equal(image.contentType, 'image/png');
  assert.deepEqual(image.bytes, Buffer.from([137, 80, 78, 71]));
  const page = await f.reader.list({ projectId: 'hosted', limit: 2 });
  assert.equal(page.entries.length, 2);
  assert.equal(page.nextCursor, 2);
  await assert.rejects(f.reader.list({ projectId: 'hosted', cursor: -1 }), {
    code: 'DESKTOP_HISTORY_PAGE',
  });
});

test('all 73 revisions across 16 candidate arrays have stable individual records through pagination and download', async (t) => {
  const f = await fixture(t);
  const data = JSON.parse(await fs.readFile(path.join(f.base, f.analysis)));
  data.candidateRevisions = Object.fromEntries(
    Array.from({ length: 16 }, (_, candidate) => [
      'candidate:' + candidate,
      Array.from({ length: candidate < 9 ? 5 : 4 }, (_, revision) => ({
        id: 'candidate:' + candidate,
        jobId: 'job:1',
        projectId: 'desktop',
        passageId: 'old:1',
        revisionId: `revision:${candidate}:${revision}`,
        raw: `N("leitura ${candidate}-${revision}")`,
        canvas: { fragments: [], positions: {} },
        rationale: 'Justificativa preservada',
        status: 'ready-for-review',
        updatedAt: '2026-09-27T12:00:00Z',
        evaluation: {
          expression: `N("leitura ${candidate}-${revision}")`,
          surface: 'leitura',
          annotated: 'leitura[N]',
        },
      })),
    ]),
  );
  const bytes = Buffer.from(JSON.stringify(data));
  await fs.writeFile(path.join(f.base, f.analysis), bytes);
  const manifestFile = path.join(f.base, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestFile));
  manifest.files.find((file) => file.path === f.analysis).sha256 = sha(bytes);
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  const params = {
    projectId: 'hosted',
    passageId: 'passage:current',
    kind: 'candidate-revision',
    limit: 50,
  };
  const first = await f.reader.list(params);
  assert.equal(first.total, 73);
  assert.equal(first.entries.length, 50);
  assert.equal(first.nextCursor, 50);
  const second = await f.reader.list({ ...params, cursor: first.nextCursor });
  assert.equal(second.entries.length, 23);
  assert.equal(second.nextCursor, null);
  const entries = [...first.entries, ...second.entries];
  assert.equal(new Set(entries.map((row) => row.recordId)).size, 73);
  assert.deepEqual((await f.reader.list(params)).entries, first.entries);
  for (const row of entries) {
    const [candidate, revision] = JSON.parse(row.recordId);
    assert.equal(row.revisionNumber, revision + 1);
    assert.equal(row.originalPassageId, 'old:1');
    const item = await f.reader.get({ projectId: 'hosted', ...row });
    assert.deepEqual(item.data, data.candidateRevisions[candidate][revision]);
    assert.equal(Array.isArray(item.data), false);
  }
  await assert.rejects(
    f.reader.get({
      projectId: 'hosted',
      ...entries[0],
      recordId: JSON.stringify(['candidate:0', 99]),
    }),
    { code: 'DESKTOP_RECORD_MISSING' },
  );
  assert.deepEqual(
    (await f.reader.file({ projectId: 'hosted', snapshot: f.snapshot, path: f.analysis })).bytes,
    bytes,
  );
});

test('changed or symlinked historical files are rejected even after a cached read', async (t) => {
  const f = await fixture(t);
  await f.reader.list({ projectId: 'hosted' });
  await fs.writeFile(path.join(f.base, f.analysis), '{}');
  await assert.rejects(
    f.reader.get({ projectId: 'hosted', snapshot: f.snapshot, path: f.analysis }),
    { code: 'DESKTOP_ARCHIVE_CHANGED' },
  );
  const original = path.join(f.base, f.drafts),
    other = path.join(f.directory, 'outside.json');
  await fs.copyFile(original, other);
  await fs.unlink(original);
  await fs.symlink(other, original);
  await assert.rejects(
    f.reader.file({ projectId: 'hosted', snapshot: f.snapshot, path: f.drafts }),
    { code: 'DESKTOP_ARCHIVE_INVALID' },
  );
});

test('browser PDF buffers are individually readable with portable restore mappings and original retry records', async (t) => {
  const f = await fixture(t);
  const file = 'files/browser-storage.json';
  const key = 'pydicate-studio:evidence-draft:v1:' + JSON.stringify(['desktop', 'fonte', 'old:1']);
  const data = {
    format: 'pydicate-browser-storage',
    version: 1,
    origins: [
      {
        origin: 'studio://app',
        entries: {
          [key]: JSON.stringify({ regions: [], view: { pageIndex: 3 } }),
          'pydicate-studio:submission:v1:old': 'retry-id',
        },
      },
    ],
  };
  const bytes = Buffer.from(JSON.stringify(data));
  const manifestPath = path.join(f.base, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath));
  manifest.files.push({ path: file, kind: 'preferences', sha256: sha(bytes) });
  await fs.writeFile(path.join(f.base, file), bytes);
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  const list = await f.reader.list({
    projectId: 'hosted',
    passageId: 'passage:current',
    kind: 'pdf-buffer',
  });
  assert.equal(list.entries.length, 1);
  const item = await f.reader.get({ projectId: 'hosted', ...list.entries[0] });
  assert.equal(item.data.value.view.pageIndex, 3);
  assert.equal(item.browserRestore.passageMappings['old:1'], 'passage:current');
  assert.equal((await f.reader.list({ projectId: 'hosted', kind: 'retry' })).entries.length, 1);
});

test('large history summaries are reused across filters without retaining/re-reading entire records', async (t) => {
  const f = await fixture(t),
    file = path.join(f.base, f.analysis);
  const original = JSON.parse(await fs.readFile(file));
  original.padding = 'x'.repeat(9 * 1024 * 1024);
  const bytes = Buffer.from(JSON.stringify(original));
  await fs.writeFile(file, bytes);
  const manifestPath = path.join(f.base, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath));
  manifest.files.find((item) => item.path === f.analysis).sha256 = sha(bytes);
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  const read = fs.readFile;
  let reads = 0;
  fs.readFile = async function (name, ...args) {
    if (name === file) reads++;
    return read.call(this, name, ...args);
  };
  try {
    await f.reader.list({ projectId: 'hosted' });
    await f.reader.list({ projectId: 'hosted', kind: 'conversation' });
    assert.equal(reads, 1);
    await f.reader.get({
      projectId: 'hosted',
      snapshot: f.snapshot,
      path: f.analysis,
      section: 'jobs',
      recordId: 'job:1',
    });
    assert.equal(reads, 2);
  } finally {
    fs.readFile = read;
  }
});
