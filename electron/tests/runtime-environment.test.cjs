'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runtimePaths, resolveRuntimeEnvironment } = require('../runtime-environment.cjs');

function fixture(t, platform = 'darwin', arch = 'arm64') {
  const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-runtime-test-'));
  t.after(() => fs.rmSync(resourcesPath, { recursive: true, force: true }));
  const directory = path.join(resourcesPath, 'runtime');
  const locations = runtimePaths(directory, platform, arch);
  for (const filename of [locations.python, locations.git]) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, 'fixture');
  }
  fs.mkdirSync(locations.gitExecPath, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    JSON.stringify({ version: 1, platform, arch }),
  );
  return { resourcesPath, directory, locations };
}

test('packaged runtime ignores host executables and Python environment while preserving input', (t) => {
  const { resourcesPath, locations } = fixture(t);
  const env = {
    PATH: '/host/bin',
    PYDICATE_PYTHON: '/host/python',
    PYDICATE_GIT: '/host/git',
    PYDICATE_RUNTIME_DIR: '/different/runtime',
    PYTHONHOME: '/host/env',
    PYTHONPATH: '/host/packages',
    PYTHONUSERBASE: '/host/user',
    PYTHONPLATLIBDIR: 'host-lib',
    __PYVENV_LAUNCHER__: '/host/launcher',
    VIRTUAL_ENV: '/host/venv',
    LOCAL_GIT_DIRECTORY: '/host/gitdir',
    GIT_EXEC_PATH: '/host/gitexec',
    GIT_DIR: '/host/repository.git',
    TEST_VALUE: 'kept',
  };
  const original = { ...env };
  const runtime = resolveRuntimeEnvironment({
    isPackaged: true,
    resourcesPath,
    platform: 'darwin',
    arch: 'arm64',
    env,
  });
  assert.equal(runtime.python, locations.python);
  assert.equal(runtime.git, locations.git);
  assert.equal(runtime.env.PYDICATE_PYTHON, locations.python);
  assert.equal(runtime.env.PYDICATE_GIT, locations.git);
  assert.equal(runtime.env.GIT_EXEC_PATH, locations.gitExecPath);
  assert.equal(
    runtime.env.PATH,
    [path.dirname(locations.python), path.dirname(locations.git), '/host/bin'].join(':'),
  );
  for (const key of [
    'PYTHONHOME',
    'PYTHONPATH',
    'PYTHONUSERBASE',
    'PYTHONPLATLIBDIR',
    '__PYVENV_LAUNCHER__',
    'VIRTUAL_ENV',
    'LOCAL_GIT_DIRECTORY',
    'PYDICATE_RUNTIME_DIR',
    'GIT_DIR',
  ])
    assert.equal(runtime.env[key], undefined);
  assert.equal(runtime.env.PYTHONNOUSERSITE, '1');
  assert.equal(runtime.env.PYTHONUTF8, '1');
  assert.equal(runtime.env.TEST_VALUE, 'kept');
  assert.deepEqual(env, original);
});

test('Windows has one PATH, includes Git helpers, and uses bundled exe files', (t) => {
  const { resourcesPath, locations } = fixture(t, 'win32', 'x64');
  const runtime = resolveRuntimeEnvironment({
    isPackaged: true,
    resourcesPath,
    platform: 'win32',
    arch: 'x64',
    env: { Path: 'C:\\Windows\\System32', PYTHONHOME: 'C:\\old-python' },
  });
  assert.equal(path.basename(runtime.python), 'python.exe');
  assert.equal(path.basename(runtime.git), 'git.exe');
  assert.equal(runtime.env.Path, undefined);
  assert.deepEqual(runtime.env.PATH.split(';'), [
    path.dirname(locations.python),
    ...locations.binaryDirectories,
    'C:\\Windows\\System32',
  ]);
  assert.match(runtime.env.GIT_EXEC_PATH, /mingw64/);
});

test('Linux Git receives its relocatable helper, template and certificate paths', (t) => {
  const { resourcesPath, locations } = fixture(t, 'linux', 'x64');
  const runtime = resolveRuntimeEnvironment({
    isPackaged: true,
    resourcesPath,
    platform: 'linux',
    arch: 'x64',
    env: {},
  });
  assert.equal(runtime.env.PREFIX, locations.gitDirectory);
  assert.equal(runtime.env.GIT_SSL_CAINFO, locations.gitCertificate);
  assert.equal(runtime.env.GIT_TEMPLATE_DIR, locations.gitTemplateDirectory);
  assert.equal(runtime.env.GIT_CONFIG_SYSTEM, locations.gitSystemConfig);
});

test('a missing or wrong packaged runtime fails instead of silently using host tools', (t) => {
  const { resourcesPath, locations } = fixture(t);
  const options = {
    isPackaged: true,
    resourcesPath,
    platform: 'darwin',
    arch: 'arm64',
    env: { PYDICATE_PYTHON: '/fallback' },
  };
  fs.rmSync(locations.python);
  assert.throws(() => resolveRuntimeEnvironment(options), /Reinstale/);
  assert.throws(() => resolveRuntimeEnvironment({ ...options, arch: 'x64' }), /Reinstale/);
  assert.throws(
    () => resolveRuntimeEnvironment({ ...options, resourcesPath: undefined }),
    /recursos/,
  );
});

test('development keeps explicit host overrides and can opt into a prepared runtime', (t) => {
  const env = { PATH: '/host/bin', PYDICATE_PYTHON: '/custom/python', PYDICATE_GIT: '/custom/git' };
  const development = resolveRuntimeEnvironment({ env });
  assert.equal(development.bundled, false);
  assert.equal(development.python, '/custom/python');
  assert.equal(development.git, '/custom/git');
  assert.deepEqual(development.env, env);
  const { directory, locations } = fixture(t);
  const prepared = resolveRuntimeEnvironment({
    platform: 'darwin',
    arch: 'arm64',
    env: { ...env, PYDICATE_RUNTIME_DIR: directory },
  });
  assert.equal(prepared.bundled, true);
  assert.equal(prepared.python, locations.python);
});

test('runtime archive verification rejects modified cached bytes', async (t) => {
  const { verifyArchive } = await import('../../scripts/prepare-runtime.mjs');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-runtime-checksum-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const archive = path.join(temporary, 'python.tar.gz');
  fs.writeFileSync(archive, 'expected release bytes');
  const digest = createHash('sha256').update('expected release bytes').digest('hex');
  assert.equal(await verifyArchive(archive, digest), digest);
  fs.writeFileSync(archive, 'modified bytes');
  await assert.rejects(verifyArchive(archive, digest), /checksum mismatch/);
});

test('build chooses pinned native artifacts and rejects accidental cross-target preparation', async () => {
  const { pythonArtifact, prepareRuntime } = await import('../../scripts/prepare-runtime.mjs');
  assert.match(pythonArtifact('win32', 'x64').name, /x86_64-pc-windows-msvc-install_only_stripped/);
  assert.match(pythonArtifact('darwin', 'arm64').name, /aarch64-apple-darwin/);
  assert.throws(() => pythonArtifact('linux', 'ia32'), /No bundled Python/);
  await assert.rejects(
    prepareRuntime({ platform: process.platform === 'win32' ? 'linux' : 'win32' }),
    /native runner/,
  );
});
