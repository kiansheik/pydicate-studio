const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { transformHtml, transformScript, transformStyles } = require('../dictionary/transform.cjs');
const fingerprint = `sha256:${'a'.repeat(64)}`;

test('dictionary source decoration preserves original row identity even with equal headwords and senses', () => {
  const source = `function mapCompressedData(data) { return data.map((item,index) => ({first_word: item.f || '', definition: item.d})); }
function renderResult(result) { const entry = {classList:{add(){}},dataset:{}}; entry.classList.add('entry'); return entry; }
globalThis.result=mapCompressedData([{f:'ara',d:'dia'},{f:'ara',d:'tempo'}]).map(renderResult);`;
  const context = {};
  vm.runInNewContext(transformScript(source), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), [
    { classList: {}, dataset: { studioEntryIndex: '0' } },
    { classList: {}, dataset: { studioEntryIndex: '1' } },
  ]);
  vm.runInNewContext(
    `${transformScript(source)};globalThis.neo=renderResult({first_word:'novo'});`,
    context,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(context.neo.dataset)), {});
});

test('changed dictionary source fails closed instead of silently selecting by spelling', () => {
  assert.throws(() => transformScript('unrecognized code'), /site do dicionário mudou/);
  const repeated =
    "first_word: item.f || '', first_word: item.f || '', entry.classList.add('entry');";
  assert.throws(() => transformScript(repeated), /site do dicionário mudou/);
});

test('served HTML keeps the real dictionary UI and local scripts while removing analytics', () => {
  const source = `<html><head><script async src="https://www.googletagmanager.com/gtag/js?id=example"></script><script>window.dataLayer=[];gtag('config','example');</script><script defer src="/nhe-enga/js/index.js"></script></head><body><section id="results"></section></body></html>`;
  const output = transformHtml(source, { datasetFingerprint: fingerprint });
  assert.ok(output.includes('<section id="results"></section>'));
  assert.ok(output.includes('src="/nhe-enga/js/index.js"'));
  assert.ok(output.includes(`data-dataset-fingerprint="${fingerprint}"`));
  assert.ok(output.includes('data-parent-origin="studio://app"'));
  assert.ok(output.includes('/__studio_dictionary/bridge.js'));
  assert.doesNotMatch(output, /googletagmanager|gtag\(|dataLayer/);
  assert.throws(() => transformHtml(source, { datasetFingerprint: 'unbound' }), /Identidade/);
  assert.throws(
    () =>
      transformHtml(source, { datasetFingerprint: fingerprint, bridgeBase: 'https://other.test/' }),
    /Caminho/,
  );
});

test('offline style transformation removes remote fonts while retaining original layout rules', () => {
  assert.equal(
    transformStyles(
      `@import url('https://fonts.googleapis.com/css?family=Example');\n.entry { color: red; }`,
    ),
    '\n.entry { color: red; }',
  );
});

test('current neighboring dictionary source supports the bounded decoration without changing its files', (t) => {
  const parent = process.env.PYDICATE_PROJECT_PARENT ?? path.resolve(__dirname, '../../..');
  const root = path.join(parent, 'nhe-enga');
  if (!fs.existsSync(path.join(root, 'js/index.js')))
    return t.skip('Local dictionary checkout is unavailable.');
  const script = fs.readFileSync(path.join(root, 'js/index.js'), 'utf8');
  const decorated = transformScript(script);
  assert.ok(decorated.includes('appendOptionsToResultDiv(preview, result.con'));
  assert.ok(decorated.includes("classList.add('show-more')"));
  assert.ok(decorated.includes('keyForItem(entry.item)'));
  new vm.Script(decorated);
  const html = transformHtml(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    datasetFingerprint: fingerprint,
  });
  assert.ok(html.includes('id="searchInput"'));
  assert.ok(html.includes('id="toggleContainer"'));
});
