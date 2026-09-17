const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const validate = require('../validation.cjs');
const { DraftStore } = require('../draft-store.cjs');

function canvas() {
  return {
    fragments: [
      { id: 'saved', raw: 'emi * tym # guardar 🦜', x: -120, y: 300 },
      { id: 'unfinished', raw: 'helper( # continuar', x: 800, y: 50 },
    ],
    positions: { 'main:root/right': { x: 80, y: -20 }, 'saved:root': { x: -120, y: 300 } },
  };
}
function envelope() {
  return {
    version: 1,
    projectId: 'canvas:project',
    drafts: {
      'passage:1': {
        passageId: 'passage:1',
        revisionId: 'r1',
        sourceFingerprint: 'source:1',
        diplomatic: '',
        normalized: '',
        translation: '',
        notes: 'Fragmentos locais.',
        raw: 'tym * __studio_slot_a1',
        analysis: null,
        canvas: canvas(),
        updatedAt: '2026-09-17T15:00:00.000Z',
      },
    },
  };
}

test('desktop canvas validation preserves unknown/incomplete source text and exact positions', () => {
  const value = envelope();
  assert.equal(validate.envelope(value), value);
  assert.deepEqual(validate.canvas(JSON.parse(JSON.stringify(canvas()))), canvas());
  const legacy = envelope();
  delete legacy.drafts['passage:1'].canvas;
  assert.equal(validate.envelope(legacy), legacy);
  const vertical = { ...canvas(), layout: 'bottom-up' };
  assert.deepEqual(validate.canvas(vertical), vertical);
});

test('desktop canvas validation rejects ambiguous identities and position data rather than dropping it', () => {
  const invalid = [
    { ...canvas(), fragments: [canvas().fragments[0], canvas().fragments[0]] },
    { ...canvas(), fragments: [{ id: 'main', raw: 'tym', x: 0, y: 0 }] },
    { ...canvas(), fragments: [{ id: '__proto__', raw: 'tym', x: 0, y: 0 }] },
    { ...canvas(), fragments: [{ id: 'bad:id', raw: 'tym', x: 0, y: 0 }] },
    { ...canvas(), positions: { 'missing:root': { x: 0, y: 0 } } },
    { ...canvas(), positions: { 'main:root': { x: Infinity, y: 0 } } },
    { ...canvas(), positions: { 'main:root': { x: NaN, y: 0 } } },
    { ...canvas(), positions: { 'main:root': { x: 1_000_001, y: 0 } } },
    { ...canvas(), positions: { 'main:root': { x: 0, y: 0, approved: true } } },
    { ...canvas(), approval: 'approved' },
    { ...canvas(), layout: 'sideways' },
  ];
  for (const value of invalid) assert.throws(() => validate.canvas(value), /Dados inválidos/);
});

test('desktop canvas validation bounds fragment/text/position counts', () => {
  const invalid = [
    {
      fragments: Array.from({ length: 129 }, (_, index) => ({
        id: `f${index}`,
        raw: 'tym',
        x: 0,
        y: 0,
      })),
      positions: {},
    },
    { fragments: [{ id: 'long', raw: 'a'.repeat(100_001), x: 0, y: 0 }], positions: {} },
    {
      fragments: Array.from({ length: 11 }, (_, index) => ({
        id: `f${index}`,
        raw: 'a'.repeat(100_000),
        x: 0,
        y: 0,
      })),
      positions: {},
    },
    {
      fragments: [],
      positions: Object.fromEntries(
        Array.from({ length: 4097 }, (_, index) => [`main:root/${index}`, { x: 0, y: 0 }]),
      ),
    },
  ];
  for (const value of invalid) assert.throws(() => validate.canvas(value), /Dados inválidos/);
});

test('canvas and incomplete primary source survive an actual draft-store restart atomically', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-canvas-drafts-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new DraftStore(directory);
  const value = envelope();
  await store.save(value);
  const reopened = new DraftStore(directory);
  assert.deepEqual(await reopened.load(value.projectId), value);
  const changed = structuredClone(value);
  changed.drafts['passage:1'].raw = '';
  changed.drafts['passage:1'].canvas.fragments.push({
    id: 'whole',
    raw: value.drafts['passage:1'].raw,
    x: 100,
    y: 200,
  });
  changed.drafts['passage:1'].canvas.positions = { 'saved:root': { x: -120, y: 300 } };
  changed.drafts['passage:1'].revisionId = 'r2';
  await reopened.save(changed);
  assert.deepEqual(await new DraftStore(directory).load(value.projectId), changed);
  assert.equal(value.drafts['passage:1'].canvas.fragments.length, 2);
});

test('invalid persisted canvas remains recoverable and cannot be overwritten by autosave', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-canvas-damaged-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new DraftStore(directory);
  const invalid = envelope();
  invalid.drafts['passage:1'].canvas.fragments[0].x = null;
  const contents = JSON.stringify(invalid);
  await fs.writeFile(store.filename(invalid.projectId), contents);
  await assert.rejects(store.load(invalid.projectId), /preservado para recuperação/);
  await assert.rejects(store.save(envelope()), /preservado para recuperação/);
  assert.equal(await fs.readFile(store.filename(invalid.projectId), 'utf8'), contents);
});
