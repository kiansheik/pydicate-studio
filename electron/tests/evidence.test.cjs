'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createEvidenceService } = require('../evidence-service.cjs');
const { makePdfFixture } = require('./pdf-fixture.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-evidence-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const original = path.join(root, 'witness.pdf');
  const stateDirectory = path.join(root, 'state');
  await fs.writeFile(original, makePdfFixture());
  let chosen = original;
  const service = () => createEvidenceService({ stateDirectory, chooseFile: async () => chosen });
  const params = { projectId: 'project:a', sourceId: 'araujo', passageId: 'passage:stable-a' };
  const api = service();
  const attached = await api.invoke('evidence_attach', { ...params, expectedRevision: 0 });
  const region = {
    id: 'region:a',
    assetId: attached.asset.id,
    pageIndex: 0,
    rect: [100, 300, 260, 400],
  };
  const save = {
    ...params,
    expectedRevision: attached.revision,
    assetId: attached.asset.id,
    regions: [region],
    view: { pageIndex: 0, zoom: 1.5, rotation: 270 },
  };
  return {
    root,
    original,
    stateDirectory,
    params,
    api,
    attached,
    region,
    save,
    service,
    choose: (file) => {
      chosen = file;
    },
  };
}

test('managed bytes and native-point regions survive restart, original relocation and passage navigation', async (t) => {
  const f = await fixture(t);
  const saved = await f.api.invoke('evidence_save', f.save);
  assert.equal(saved.revision, 2);
  await fs.rename(f.original, path.join(f.root, 'moved.pdf'));
  const restarted = f.service();
  const status = await restarted.invoke('evidence_status', f.params);
  assert.equal(status.asset.originalState, 'missing');
  assert.equal(status.asset.managedState, 'ok');
  assert.deepEqual(status.passage.regions, [f.region]);
  assert.deepEqual(status.passage.view, f.save.view);
  assert.equal(
    (await restarted.invoke('evidence_status', { ...f.params, passageId: 'passage:b' })).passage,
    null,
  );
  const bytes = await restarted.invoke('evidence_bytes', {
    ...f.params,
    assetId: f.attached.asset.id,
  });
  assert.ok(bytes instanceof ArrayBuffer);
  assert.deepEqual(Buffer.from(bytes), makePdfFixture());
  f.choose(path.join(f.root, 'moved.pdf'));
  const relocated = await restarted.invoke('evidence_relocate', {
    ...f.params,
    expectedRevision: 2,
  });
  assert.equal(relocated.asset.originalState, 'ok');
  assert.deepEqual(relocated.passage.regions, [f.region]);
});

test('unset passage inherits prior same-PDF geometry without saving evidence; explicit empty locations win', async (t) => {
  const f = await fixture(t);
  await f.api.invoke('evidence_save', { ...f.save, view: { ...f.save.view, pageIndex: 1 } });
  const next = {
    ...f.params,
    passageId: 'passage:b',
    previousPassages: [{ id: f.params.passageId, ordinal: 1 }],
  };
  const inherited = await f.service().invoke('evidence_status', next);
  assert.equal(inherited.passage, null);
  assert.equal(inherited.revision, 2, 'reading never mutates the manifest');
  assert.equal(inherited.inherited.fromOrdinal, 1);
  assert.deepEqual(inherited.inherited.regions[0].rect, f.region.rect);
  assert.notEqual(inherited.inherited.regions[0].id, f.region.id);
  assert.equal(inherited.inherited.view.pageIndex, 1);
  assert.equal(inherited.inherited.view.rotation, 270);
  await f.api.invoke('evidence_save', {
    ...next,
    assetId: f.attached.asset.id,
    expectedRevision: 2,
    regions: [],
    view: { pageIndex: 1, zoom: 1, rotation: 0 },
  });
  const cleared = await f.service().invoke('evidence_status', next);
  assert.deepEqual(cleared.passage.regions, []);
  assert.equal(cleared.inherited, null);
  assert.equal(cleared.passage.viewAssetId, f.attached.asset.id);
});

test('inheritance respects supplied source order and never borrows another source or replacement PDF', async (t) => {
  const f = await fixture(t);
  await f.api.invoke('evidence_save', f.save);
  const previousPassages = [{ id: f.params.passageId, ordinal: 1 }];
  const otherSource = await f.api.invoke('evidence_status', {
    ...f.params,
    sourceId: 'another-book',
    passageId: 'passage:b',
    previousPassages,
  });
  assert.equal(otherSource.inherited, null);
  await f.api.invoke('evidence_save', {
    ...f.save,
    passageId: 'passage:b',
    expectedRevision: 2,
    view: { ...f.save.view, pageIndex: 1 },
  });
  const next = {
    ...f.params,
    passageId: 'passage:c',
    previousPassages: [{ id: 'passage:b', ordinal: 2 }, ...previousPassages],
  };
  assert.equal((await f.api.invoke('evidence_status', next)).inherited.fromOrdinal, 2);
  assert.equal(
    (
      await f.api.invoke('evidence_status', {
        ...next,
        previousPassages: [...previousPassages, { id: 'passage:b', ordinal: 2 }],
      })
    ).inherited.fromOrdinal,
    1,
  );
  await fs.writeFile(f.original, makePdfFixture({ variant: true }));
  await f.api.invoke('evidence_attach', { ...f.params, expectedRevision: 3, replace: true });
  assert.equal((await f.api.invoke('evidence_status', next)).inherited, null);
});

test('replacement is detected; explicit different-witness binding retains but does not reassociate old geometry', async (t) => {
  const f = await fixture(t);
  await f.api.invoke('evidence_save', f.save);
  await fs.writeFile(f.original, makePdfFixture({ variant: true }));
  assert.equal((await f.api.invoke('evidence_status', f.params)).asset.originalState, 'changed');
  await assert.rejects(
    f.api.invoke('evidence_relocate', { ...f.params, expectedRevision: 2 }),
    /outra impressão digital/,
  );
  await assert.rejects(
    f.api.invoke('evidence_attach', { ...f.params, expectedRevision: 2 }),
    /substituição precisa ser explícita/,
  );
  const replaced = await f.api.invoke('evidence_attach', {
    ...f.params,
    expectedRevision: 2,
    replace: true,
  });
  assert.notEqual(replaced.asset.id, f.attached.asset.id);
  assert.equal(replaced.retainedAssetCount, 2);
  assert.deepEqual(replaced.passage.regions, [f.region]);
  await assert.rejects(
    f.api.invoke('evidence_save', { ...f.save, expectedRevision: 3 }),
    /PDF selecionado mudou/,
  );
});

test('serialized concurrent saves reject stale versions without losing the accepted regions', async (t) => {
  const f = await fixture(t);
  const result = await Promise.allSettled([
    f.api.invoke('evidence_save', f.save),
    f.api.invoke('evidence_save', { ...f.save, regions: [] }),
  ]);
  assert.equal(result[0].status, 'fulfilled');
  assert.equal(result[1].status, 'rejected');
  assert.match(result[1].reason.message, /mudou em outra janela/);
  assert.deepEqual((await f.api.invoke('evidence_status', f.params)).passage.regions, [f.region]);
});

test('corrupt manifests, damaged PDF copies and interrupted temporary saves are preserved', async (t) => {
  const f = await fixture(t);
  await f.api.invoke('evidence_save', f.save);
  const manifests = await fs.readdir(path.join(f.stateDirectory, 'sources'));
  const manifest = path.join(f.stateDirectory, 'sources', manifests[0]);
  await fs.writeFile(`${manifest}.interrupted.tmp`, '{incomplete');
  assert.deepEqual((await f.service().invoke('evidence_status', f.params)).passage.regions, [
    f.region,
  ]);
  const managed = path.join(f.stateDirectory, 'assets', `${f.attached.asset.id}.pdf`);
  await fs.writeFile(managed, makePdfFixture({ variant: true }));
  await assert.rejects(
    f.api.invoke('evidence_bytes', { ...f.params, assetId: f.attached.asset.id }),
    /cópia do PDF foi alterada/,
  );
  await assert.rejects(
    f.api.invoke('evidence_save', { ...f.save, expectedRevision: 2 }),
    /Cópia do PDF indisponível/,
  );
  await f.api.invoke('evidence_relocate', { ...f.params, expectedRevision: 2 });
  assert.equal((await f.api.invoke('evidence_status', f.params)).asset.managedState, 'ok');
  await fs.writeFile(manifest, '{broken');
  await assert.rejects(
    f.api.invoke('evidence_attach', { ...f.params, expectedRevision: 3 }),
    /arquivo foi preservado/,
  );
  assert.equal(await fs.readFile(manifest, 'utf8'), '{broken');
});

test('invalid coordinates and cross-witness regions do not mutate stored data', async (t) => {
  const f = await fixture(t);
  for (const region of [
    { ...f.region, rect: [0, 0, 0, 3] },
    { ...f.region, rect: [0, 0, NaN, 3] },
    { ...f.region, pageIndex: -1 },
    { ...f.region, assetId: 'a'.repeat(64) },
  ])
    await assert.rejects(f.api.invoke('evidence_save', { ...f.save, regions: [region] }));
  assert.equal((await f.api.invoke('evidence_status', f.params)).revision, 1);
});

test('pending lines use a read-only predecessor guide and persist it separately through repeated lines', async (t) => {
  const f = await fixture(t);
  const first = await f.api.invoke('evidence_save', f.save);
  const predecessor = structuredClone(first.passage);
  const pending = {
    ...f.params,
    passageId: 'passage:pending-a',
    previousPassageId: f.params.passageId,
    newPassageGuide: true,
  };
  const seed = await f.service().invoke('evidence_status', pending);
  assert.equal(seed.passage, null);
  assert.equal(seed.revision, first.revision);
  assert.equal(seed.guideSeed.fromPassageId, f.params.passageId);
  assert.deepEqual(seed.guideSeed.regions, [f.region]);
  const guide = {
    assetId: f.attached.asset.id,
    fromPassageId: f.params.passageId,
    region: f.region,
  };
  const saved = await f.api.invoke('evidence_save', {
    ...pending,
    expectedRevision: seed.revision,
    assetId: f.attached.asset.id,
    regions: [],
    view: { ...f.save.view, pageIndex: 1 },
    guide,
  });
  assert.deepEqual(saved.passage.regions, []);
  assert.deepEqual(saved.passage.guide, guide);
  const restarted = f.service();
  assert.deepEqual((await restarted.invoke('evidence_status', pending)).passage, saved.passage);
  const following = await restarted.invoke('evidence_status', {
    ...pending,
    passageId: 'passage:pending-b',
    previousPassageId: pending.passageId,
  });
  assert.equal(following.guideSeed.fromPassageId, pending.passageId);
  assert.equal(following.guideSeed.view.pageIndex, 1);
  assert.deepEqual(following.guideSeed.regions, []);
  assert.deepEqual(following.guideSeed.guide, guide);
  assert.deepEqual((await restarted.invoke('evidence_status', f.params)).passage, predecessor);
  assert.equal(
    (await restarted.invoke('evidence_status', { ...pending, sourceId: 'another-book' })).guideSeed,
    null,
  );
});

test('guide fallback uses source evidence and rejects invalid guide saves without losing prior data', async (t) => {
  const f = await fixture(t);
  await f.api.invoke('evidence_save', f.save);
  const pending = {
    ...f.params,
    passageId: 'passage:new',
    newPassageGuide: true,
    previousPassageId: 'unknown',
  };
  const seed = await f.api.invoke('evidence_status', pending);
  assert.equal(seed.guideSeed.fromPassageId, f.params.passageId);
  for (const guide of [
    { assetId: 'a'.repeat(64), fromPassageId: f.params.passageId, region: f.region },
    { assetId: f.attached.asset.id, fromPassageId: '', region: f.region },
    {
      assetId: f.attached.asset.id,
      fromPassageId: f.params.passageId,
      region: { ...f.region, rect: [0, 0, 0, 1] },
    },
  ])
    await assert.rejects(
      f.api.invoke('evidence_save', {
        ...f.save,
        ...pending,
        expectedRevision: 2,
        guide,
        regions: [],
      }),
    );
  const unchanged = await f.api.invoke('evidence_status', f.params);
  assert.equal(unchanged.revision, 2);
  assert.deepEqual(unchanged.passage.regions, [f.region]);
});

test('inserting before the first passage never borrows a later PDF region as its guide', async (t) => {
  const { api, params, save } = await fixture(t);
  await api.invoke('evidence_save', save);
  const inserted = await api.invoke('evidence_status', {
    ...params,
    passageId: 'passage:inserted',
    newPassageGuide: true,
    insertionBeforePassageId: params.passageId,
    previousPassages: [],
    lastVisitedPassageId: params.passageId,
  });
  assert.deepEqual(inserted.guideCandidates, []);
  assert.equal(inserted.guideSeed, null);
});
