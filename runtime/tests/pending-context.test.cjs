const test = require('node:test');
const assert = require('node:assert/strict');
const { pendingContext } = require('../pending-context.cjs');
test('pending contexts follow insertion anchors through unpublished and newly published passages', () => {
  const project = { passages: [{ id: 'passage:later' }] };
  const envelope = {
    drafts: {
      'pending:first': { pending: { beforePassageId: 'pending:second' } },
      'pending:second': { pending: { beforePassageId: 'passage:later' } },
    },
  };
  assert.deepEqual(pendingContext(project, envelope, 'pending:first'), {
    beforePassageId: 'passage:later',
  });
  delete envelope.drafts['pending:second'];
  project.passages.push({ id: 'passage:second' });
  assert.deepEqual(pendingContext(project, envelope, 'pending:first'), {
    beforePassageId: 'passage:second',
  });
});
test('pending context refuses broken chains and cycles rather than guessing a publication point', () => {
  const envelope = {
    drafts: { 'pending:first': { pending: { beforePassageId: 'pending:first' } } },
  };
  assert.throws(() => pendingContext({ passages: [] }, envelope, 'pending:first'), /Ciclo/);
  envelope.drafts['pending:first'].pending.beforePassageId = 'pending:missing';
  assert.throws(
    () => pendingContext({ passages: [] }, envelope, 'pending:first'),
    /não está disponível/,
  );
});
