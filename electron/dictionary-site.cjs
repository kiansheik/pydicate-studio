'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { transformHtml, transformScript, transformStyles } = require('./dictionary/transform.cjs');

const ORIGIN = 'studio://dictionary';
const REQUIRED = [
  'index.html',
  'styles.css',
  'js/index.js',
  'js/pako.min.js',
  'js/papaparse.min.js',
  'neologisms.csv',
  'docs/dict-conjugated.json.gz',
];
const STATIC = new Set([
  ...REQUIRED,
  'favicon.ico',
  'manifest.json',
  'neologisms.csv',
  'docs/primary_sources/index.html',
  'docs/primary_sources/image-formats.json',
]);
const POLICY =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors studio://app studio://dictionary http://127.0.0.1:5173";
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.gz': 'application/gzip',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function createDictionarySite({
  getProject,
  bridgeDirectory = path.join(__dirname, 'dictionary'),
  parentOrigin = 'studio://app',
}) {
  let cached;
  function selected(projectId) {
    const project = getProject();
    if (!project || project.mode !== 'local' || (projectId && project.id !== projectId))
      throw new Error('Abra o projeto local para consultar seu dicionário.');
    const repository = project.repositories.find((item) => item.name === 'nhe-enga');
    if (!repository) throw new Error('O projeto não tem o repositório nhe-enga.');
    return { project, directory: repository.path };
  }
  async function contained(directory, name) {
    const base = await fs.realpath(directory);
    const target = await fs.realpath(path.resolve(base, name));
    const relative = path.relative(base, target);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
      throw new Error('Recurso fora do dicionário.');
    return target;
  }
  async function dataset(directory) {
    const file = await contained(directory, 'docs/dict-conjugated.json.gz');
    const stat = await fs.stat(file);
    const key = `${file}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    if (cached?.key !== key) {
      const bytes = await fs.readFile(file);
      cached = {
        key,
        bytes,
        fingerprint: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
      };
    }
    return cached;
  }
  async function status(params = {}) {
    try {
      const { project, directory } = selected(params.projectId);
      for (const name of REQUIRED) await fs.access(await contained(directory, name));
      // Check the narrowly instrumented source before presenting an editable site.
      transformScript(await fs.readFile(await contained(directory, 'js/index.js'), 'utf8'));
      const data = await dataset(directory);
      return {
        available: true,
        url: `${ORIGIN}/nhe-enga/?projectId=${encodeURIComponent(project.id)}&dataset=${encodeURIComponent(data.fingerprint)}`,
        datasetFingerprint: data.fingerprint,
      };
    } catch (error) {
      return { available: false, message: `Dicionário local indisponível: ${error.message}` };
    }
  }
  function response(body, name, status = 200) {
    return new Response(body, {
      status,
      headers: {
        'Content-Type': MIME[path.extname(name)] || 'text/plain; charset=utf-8',
        'Content-Security-Policy': POLICY,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  }
  async function handle(request) {
    try {
      const url = new URL(request.url);
      if (url.protocol !== 'studio:' || url.host !== 'dictionary' || request.method !== 'GET')
        return response('Not found', '', 404);
      const { project, directory } = selected(url.searchParams.get('projectId'));
      let pathname = decodeURIComponent(url.pathname);
      if (
        pathname === '/__studio_dictionary/bridge.js' ||
        pathname === '/__studio_dictionary/bridge.css'
      ) {
        const name = path.basename(pathname);
        return response(await fs.readFile(path.join(bridgeDirectory, name)), name);
      }
      if (!pathname.startsWith('/nhe-enga/')) return response('Not found', '', 404);
      let name = pathname.slice('/nhe-enga/'.length);
      if (!name || name === 'docs/primary_sources/') name += 'index.html';
      if (
        !STATIC.has(name) &&
        !/^docs\/primary_sources\/(?:vlb|ancharte|arcat1618|betcomp|lerhist)\/\d+\.(?:png|jpg|jpeg|webp)$/.test(
          name,
        )
      )
        return response('Not found', '', 404);
      const file = await contained(directory, name);
      let bytes;
      if (name === 'docs/dict-conjugated.json.gz') bytes = (await dataset(directory)).bytes;
      else bytes = await fs.readFile(file);
      if (name === 'index.html') {
        const data = await dataset(directory);
        if (url.searchParams.has('dataset') && url.searchParams.get('dataset') !== data.fingerprint)
          return response('O dicionário mudou. Reabra a aba Dicionário.', '', 409);
        bytes = transformHtml(bytes.toString('utf8'), {
          datasetFingerprint: data.fingerprint,
          parentOrigin,
        });
      } else if (name === 'js/index.js') bytes = transformScript(bytes.toString('utf8'));
      else if (name === 'styles.css') bytes = transformStyles(bytes.toString('utf8'));
      // Project changes during disk IO cannot serve another project's assets.
      if (getProject()?.id !== project.id) return response('Projeto alterado.', '', 409);
      return response(bytes, name);
    } catch {
      return response('Recurso do dicionário local indisponível.', '', 404);
    }
  }
  return { status, handle };
}
module.exports = { createDictionarySite, ORIGIN, POLICY };
