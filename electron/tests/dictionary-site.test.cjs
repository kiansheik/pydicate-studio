'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { createDictionarySite } = require('../dictionary-site.cjs');

async function fixture(t, extra = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-dictionary-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const assets = {
    'index.html':
      '<html><head><script src="https://www.googletagmanager.com/gtag/js?id=example"></script><script>window.dataLayer = []; gtag("config", "example")</script></head><body><input id="searchInput"></body></html>',
    'styles.css':
      '@import url("https://fonts.googleapis.com/css2?family=Example"); body { color: green; }',
    'js/index.js':
      "function mapCompressedData(data) { return data.map((item, index) => ({ first_word: item.f || '', })); }\nfunction renderResults(results) { results.forEach(result => { const entry = document.createElement('div'); entry.classList.add('entry'); }); }",
    'js/pako.min.js': '/* local inflater */',
    'js/papaparse.min.js': '/* local CSV parser */',
    'neologisms.csv': 'Verbete,Definição Portuguesa\n',
    'docs/dict-conjugated.json.gz': gzipSync(
      JSON.stringify([{ f: 'aba', d: '(s.) pessoa', t: 1 }]),
    ),
    'docs/primary_sources/index.html':
      '<html><head></head><body><script>document.body.textContent="scan"</script></body></html>',
    'docs/primary_sources/vlb/1.png': Buffer.from('local scan fixture'),
    'private.env': 'PRIVATE FILE',
  };
  for (const [name, value] of Object.entries(assets)) {
    await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await fs.writeFile(path.join(directory, name), value);
  }
  let project = {
    id: 'local:dictionary-fixture',
    mode: 'local',
    repositories: [{ name: 'nhe-enga', path: directory }],
  };
  const site = createDictionarySite({ getProject: () => project, ...extra });
  return {
    directory,
    site,
    changeProject: (value) => {
      project = value;
    },
    request: (pathname, method = 'GET') =>
      site.handle(new Request('studio://dictionary' + pathname, { method })),
  };
}

test('serves the actual local HTML/scripts/data with exact entry linkage and isolated policy', async (t) => {
  const f = await fixture(t);
  const status = await f.site.status({ projectId: 'local:dictionary-fixture' });
  assert.equal(status.available, true);
  assert.match(status.datasetFingerprint, /^sha256:[a-f0-9]{64}$/);
  const html = await f.site.handle(new Request(status.url));
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-security-policy'), /connect-src 'self'/);
  const body = await html.text();
  assert.match(body, /id="searchInput"/);
  assert.match(body, /data-dataset-fingerprint="sha256:/);
  assert.doesNotMatch(body, /googletagmanager|gtag\(/);
  assert.match(
    await (await f.request('/nhe-enga/js/index.js')).text(),
    /__studioEntryIndex: index/,
  );
  assert.doesNotMatch(await (await f.request('/nhe-enga/styles.css')).text(), /https:/);
  const gzip = await f.request('/nhe-enga/docs/dict-conjugated.json.gz');
  assert.deepEqual(
    Buffer.from(await gzip.arrayBuffer()),
    await fs.readFile(path.join(f.directory, 'docs/dict-conjugated.json.gz')),
  );
  assert.equal(gzip.headers.get('content-encoding'), null);
  assert.equal((await f.request('/__studio_dictionary/bridge.js')).status, 200);
  assert.equal((await f.request('/nhe-enga/docs/primary_sources/vlb/1.png')).status, 200);
});

test('only explicit dictionary assets can be served, including through symlinks', async (t) => {
  const f = await fixture(t);
  for (const pathname of [
    '/nhe-enga/private.env',
    '/nhe-enga/.git/config',
    '/nhe-enga/docs/primary_sources/source.pdf',
    '/nhe-enga/%2e%2e/private.env',
    '/__studio_dictionary/transform.cjs',
  ])
    assert.equal((await f.request(pathname)).status, 404);
  assert.equal((await f.request('/nhe-enga/index.html', 'POST')).status, 404);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'hidden'), 'not a site asset');
  await fs.symlink(path.join(outside, 'hidden'), path.join(f.directory, 'favicon.ico'));
  assert.equal((await f.request('/nhe-enga/favicon.ico')).status, 404);
  assert.equal((await f.site.status({ projectId: 'another-project' })).available, false);
});

test('changed dataset and source adapter are visible failures instead of wrong insertion identity', async (t) => {
  const f = await fixture(t);
  const before = await f.site.status();
  await fs.writeFile(
    path.join(f.directory, 'docs/dict-conjugated.json.gz'),
    gzipSync('[{"f":"different"}]'),
  );
  const after = await f.site.status();
  assert.notEqual(before.datasetFingerprint, after.datasetFingerprint);
  assert.equal((await f.site.handle(new Request(before.url))).status, 409);
  await fs.writeFile(path.join(f.directory, 'js/index.js'), '/* unknown future site */');
  const incompatible = await f.site.status();
  assert.equal(incompatible.available, false);
  assert.match(incompatible.message, /site do dicionário mudou/);
  f.changeProject(null);
  assert.equal((await f.request('/nhe-enga/index.html')).status, 404);
});

test('development embedding targets only its actual parent origin', async (t) => {
  const f = await fixture(t, { parentOrigin: 'http://127.0.0.1:5173' });
  const status = await f.site.status();
  assert.match(
    await (await f.site.handle(new Request(status.url))).text(),
    /data-parent-origin="http:\/\/127.0.0.1:5173"/,
  );
});

test('missing jointly loaded CSV is reported before showing a broken search page', async (t) => {
  const f = await fixture(t);
  await fs.unlink(path.join(f.directory, 'neologisms.csv'));
  assert.equal((await f.site.status()).available, false);
});
