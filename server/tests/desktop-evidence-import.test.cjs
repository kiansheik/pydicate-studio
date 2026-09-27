'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createEvidenceService } = require('../../electron/evidence-service.cjs');
const { makePdfFixture } = require('../../electron/tests/pdf-fixture.cjs');
const { importDesktopEvidence } = require('../desktop-evidence-import.cjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-desktop-evidence-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateDirectory = path.join(root, 'state'),
    directory = path.join(root, 'archive');
  await fs.mkdir(path.join(directory, 'files'), { recursive: true });
  const pdf = path.join(root, 'source.pdf');
  await fs.writeFile(pdf, makePdfFixture());
  const service = createEvidenceService({
    stateDirectory: path.join(stateDirectory, 'evidence'),
    chooseFile: async () => pdf,
  });
  const params = { projectId: 'hosted', sourceId: 'source', passageId: 'current' };
  const attached = await service.invoke('evidence_attach', { ...params, expectedRevision: 0 });
  const assetId = attached.asset.id;
  const wrong = { id: 'wrong-page-37', assetId, pageIndex: 36, rect: [1, 2, 10, 20] };
  const right = { id: 'correct-page-38', assetId, pageIndex: 37, rect: [3, 4, 12, 25] };
  const before = await service.invoke('evidence_save', {
    ...params,
    assetId,
    expectedRevision: attached.revision,
    regions: [wrong, right],
    view: { pageIndex: 36, zoom: 1, rotation: 0 },
  });
  const buffer = {
    assetId,
    revision: before.revision,
    regions: [right],
    view: { pageIndex: 37, zoom: 1.5, rotation: 90 },
    baseline: JSON.stringify(before.passage),
  };
  const key = 'pydicate-studio:evidence-draft:v1:' + JSON.stringify(['desktop', 'source', 'old']);
  const options = {
    directory,
    stateDirectory,
    project: { id: 'hosted', passages: [{ id: 'current', sourceId: 'source', ordinal: 18 }] },
    receipt: {
      projectId: 'hosted',
      sourceProjectId: 'desktop',
      snapshotSha256: 'a'.repeat(64),
      passageMappings: { old: 'current' },
    },
  };
  async function archive(value = buffer, second) {
    const origins = [{ origin: 'studio://app', entries: { [key]: JSON.stringify(value) } }];
    if (second)
      origins.push({ origin: 'http://127.0.0.1:5173', entries: { [key]: JSON.stringify(second) } });
    const bytes = Buffer.from(
      JSON.stringify({ format: 'pydicate-browser-storage', version: 1, origins }),
    );
    await fs.writeFile(path.join(directory, 'files/browser-storage.json'), bytes);
    options.manifest = {
      projectId: 'desktop',
      files: [{ path: 'files/browser-storage.json', sha256: hash(bytes) }],
    };
  }
  await archive();
  const status = () => service.invoke('evidence_status', params);
  const save = async (regions) =>
    service.invoke('evidence_save', {
      ...params,
      assetId,
      expectedRevision: (await status()).revision,
      regions,
      view: buffer.view,
    });
  return { root, options, before, buffer, archive, status, save, wrong, right };
}
test('restores hand-corrected regions over the exact saved baseline, including page37 removal', async (t) => {
  const f = await fixture(t);
  const before = await f.status();
  const preview = await importDesktopEvidence({ ...f.options, dryRun: true });
  assert.equal(preview.applied, 1);
  assert.deepEqual(await f.status(), before);
  await assert.rejects(
    fs.stat(path.join(f.options.stateDirectory, 'evidence/desktop-recovery.json')),
    { code: 'ENOENT' },
  );
  const report = await importDesktopEvidence(f.options);
  assert.equal(report.applied, 1);
  assert.equal(report.conflicts.length, 0);
  const after = await f.status();
  assert.deepEqual(after.passage.regions, [f.right]);
  assert.deepEqual(after.passage.view, f.buffer.view);
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(report.passages[0].beforePages, [37, 38]);
  assert.deepEqual(report.passages[0].afterPages, [38]);
});
test('retains explicit empty region corrections instead of reviving removed boxes', async (t) => {
  const f = await fixture(t);
  await f.archive({ ...f.buffer, regions: [] });
  assert.equal((await importDesktopEvidence(f.options)).applied, 1);
  assert.deepEqual((await f.status()).passage.regions, []);
});
test('does not overwrite newer online changes or select another PDF', async (t) => {
  const f = await fixture(t);
  await f.save([{ ...f.right, rect: [10, 10, 20, 20] }]);
  const before = await f.status();
  assert.match(
    (await importDesktopEvidence(f.options)).conflicts[0].reason,
    /Online evidence differs/,
  );
  assert.deepEqual(await f.status(), before);
  await f.archive({ ...f.buffer, assetId: 'b'.repeat(64), regions: [] });
  assert.match((await importDesktopEvidence(f.options)).conflicts[0].reason, /Selected PDF/);
  assert.deepEqual(await f.status(), before);
});
test('repeat imports across snapshots never undo subsequent deliberate online edits', async (t) => {
  const f = await fixture(t);
  await importDesktopEvidence(f.options);
  // A later deliberate edit can even return to the old baseline.
  await f.save([f.wrong, f.right]);
  const before = await f.status();
  f.options.receipt.snapshotSha256 = 'b'.repeat(64);
  const repeat = await importDesktopEvidence(f.options);
  assert.equal(repeat.previouslyApplied, 1);
  assert.equal(repeat.applied, 0);
  assert.deepEqual(await f.status(), before);
});
test('ambiguous origins, missing baselines, historical identities and malformed regions stay archived', async (t) => {
  const f = await fixture(t);
  const before = await f.status();
  for (const [value, second] of [
    [f.buffer, { ...f.buffer, regions: [] }],
    [{ ...f.buffer, baseline: undefined }],
    [{ ...f.buffer, regions: [{ ...f.right, rect: [30, 2, 1, 4] }] }],
  ]) {
    await f.archive(value, second);
    const report = await importDesktopEvidence(f.options);
    assert.equal(report.applied, 0);
    assert.equal(report.conflicts.length, 1);
    assert.deepEqual(await f.status(), before);
  }
  await f.archive();
  f.options.receipt.passageMappings = {};
  assert.match((await importDesktopEvidence(f.options)).conflicts[0].reason, /Historical passage/);
});
test('verifies original bytes and rejects symlinked research and damaged recovery receipts', async (t) => {
  const f = await fixture(t),
    file = path.join(f.options.directory, 'files/browser-storage.json');
  const bytes = await fs.readFile(file);
  await fs.writeFile(file, '{}');
  await assert.rejects(importDesktopEvidence(f.options), /checksum/);
  await fs.writeFile(path.join(f.root, 'outside.json'), bytes);
  await fs.unlink(file);
  await fs.symlink(path.join(f.root, 'outside.json'), file);
  await assert.rejects(importDesktopEvidence(f.options), /Unsafe/);
  await fs.unlink(file);
  await f.archive();
  await fs.writeFile(path.join(f.options.stateDirectory, 'evidence/desktop-recovery.json'), '{}');
  await assert.rejects(importDesktopEvidence(f.options), /receipt/);
});
