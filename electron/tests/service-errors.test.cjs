'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { serviceErrorReply } = require('../service-errors.cjs');

function bridge(invoke) {
  let exposed;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8'), {
    require(module) {
      assert.equal(module, 'electron');
      return {
        ipcRenderer: { invoke },
        contextBridge: {
          exposeInMainWorld(name, api) {
            assert.equal(name, 'studio');
            // Electron's real contextBridge copies message and loses custom
            // Error properties. Model that second serialization boundary.
            exposed = Object.fromEntries(
              Object.entries(api).map(([key, fn]) => [
                key,
                async (...args) => {
                  try {
                    return await fn(...args);
                  } catch (error) {
                    throw new Error(error.message);
                  }
                },
              ]),
            );
          },
        },
      };
    },
  });
  return exposed;
}

test('service error reply carries bounded public code and message only', () => {
  const failure = Object.assign(new Error('Atualize o projeto.'), {
    code: 'STALE_ENGINE',
    stack: 'internal stack',
    token: 'private fixture',
  });
  assert.deepEqual(serviceErrorReply(failure), {
    _studioServiceError: { version: 1, code: 'STALE_ENGINE', message: 'Atualize o projeto.' },
  });
  assert.equal(
    serviceErrorReply({ code: 'ERROR_2', message: 'x'.repeat(20_000) })._studioServiceError.message
      .length,
    16_384,
  );
  for (const code of [undefined, '', 'lowercase', '_ERROR', 'A'.repeat(65), 'BAD\nCODE', 1])
    assert.equal(serviceErrorReply({ code, message: 'invalid' }), null);
});

test('coded failures survive IPC reply and contextBridge Error copying', async () => {
  const api = bridge(async (channel, method, params) => {
    assert.equal(channel, 'studio:invoke');
    assert.equal(method, 'structure_search');
    assert.equal(params.query, 'tym');
    return serviceErrorReply(
      Object.assign(new Error('Atualize e reconcilie o rascunho.'), { code: 'STALE_ENGINE' }),
    );
  });
  await assert.rejects(api.invoke('structure_search', { query: 'tym' }), {
    message: '[STUDIO:STALE_ENGINE] Atualize e reconcilie o rascunho.',
  });
});

test('successful service result shapes and ordinary rejection semantics remain unchanged', async () => {
  for (const value of [undefined, null, [], { results: [], total: 0 }, { surface: 'tym' }]) {
    const api = bridge(async () => value);
    assert.equal(await api.invoke('dictionary_lookup'), value);
  }
  const api = bridge(async () => {
    throw new Error('Falha comum.');
  });
  await assert.rejects(api.invoke('structure_search'), { message: 'Falha comum.' });
});

test('malformed reserved error packets fail closed without inventing a code', async () => {
  for (const failure of [
    null,
    { version: 2, code: 'STALE_ENGINE', message: 'bad' },
    { version: 1, code: '_ERROR', message: 'bad' },
    { version: 1, code: 'STALE_ENGINE', message: 'x'.repeat(16_385) },
  ]) {
    const api = bridge(async () => ({ _studioServiceError: failure }));
    await assert.rejects(api.invoke('structure_search'), {
      message: 'O serviço devolveu uma resposta de erro inválida.',
    });
  }
});
