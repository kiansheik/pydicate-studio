const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const validate = require('../validation.cjs');
const { DraftStore } = require('../draft-store.cjs');

function envelope() {
  const id = 'pending:91aa4cc3-bf75-47c5-a5c2-f1f5c1c1f766';
  return {
    version: 1,
    projectId: 'pending:project',
    drafts: {
      [id]: {
        passageId: id,
        revisionId: 'r1',
        sourceFingerprint: 'pending',
        raw: '',
        analysis: null,
        diplomatic: '',
        normalized: '',
        translation: '',
        notes: '',
        updatedAt: '2026-09-17T15:00:00.000Z',
        pending: {
          sourceId: 'araujo_catecismo_1686',
          previousPassageId: 'passage:previous',
          ordinal: 83,
        },
        locators: {
          printedPage: '26',
          folio: '13v',
          line: '',
          section: 'Doutrina',
          subsection: 'Orações',
        },
        canvas: { layout: 'bottom-up', fragments: [], positions: {} },
      },
    },
  };
}
test('empty pending shell retains its predecessor, section and canvas through actual draft-store restart', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-pending-shell-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const value = envelope();
  assert.equal(validate.envelope(value), value);
  await new DraftStore(directory).save(value);
  assert.deepEqual(await new DraftStore(directory).load(value.projectId), value);
});
test('desktop pending provenance rejects malformed or approval-shaped metadata without affecting legacy drafts', () => {
  const value = envelope();
  const draft = Object.values(value.drafts)[0];
  for (const patch of [
    { sourceId: '../outside' },
    { ordinal: 0 },
    { ordinal: 2.5 },
    { previousPassageId: '' },
    { approved: true },
  ]) {
    const changed = structuredClone(value);
    Object.values(changed.drafts)[0].pending = { ...draft.pending, ...patch };
    assert.throws(() => validate.envelope(changed), /Dados inválidos/);
  }
  const legacy = structuredClone(value);
  delete Object.values(legacy.drafts)[0].pending;
  assert.equal(validate.envelope(legacy), legacy);
});
