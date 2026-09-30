'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ClaudeAuth } = require('../claude-auth.cjs');

test('optional Claude status is available without configuring or launching login', async () => {
  const auth = new ClaudeAuth({ spawnImpl: () => assert.fail('must not launch a provider') });
  assert.deepEqual(await auth.status({ id: 'contributor' }), { loggedIn: false, authMethod: 'unavailable' });
  await assert.rejects(auth.start({ id: 'contributor' }), { code: 'CLAUDE_HOME_UNCONFIGURED' });
});
