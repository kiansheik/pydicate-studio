'use strict';
const path = require('node:path');
const Module = require('node:module');
let shared;
/** Compile checked-in source, never client-supplied code. Keeping one import graph
 * prevents the desktop canvas and service from becoming competing DSL generators.
 * The developer distribution already requires esbuild through Vite. */
function loadSharedAuthoring() {
  if (shared) return shared;
  const precompiled = path.join(__dirname, 'authoring', 'shared-bundle.cjs');
  if (process.resourcesPath && !process.defaultApp && require('node:fs').existsSync(precompiled)) {
    shared = require(precompiled);
    return shared;
  }
  const { buildSync } = require('esbuild');
  const filename = path.join(__dirname, 'authoring', 'shared-entry.ts');
  const result = buildSync({
    entryPoints: [filename],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    write: false,
    logLevel: 'silent',
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputFiles[0].text, filename);
  shared = compiled.exports;
  return shared;
}
module.exports = { loadSharedAuthoring };
