'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createManagedProjects, REPOSITORIES } = require('../managed-projects.cjs');

const execute = promisify(execFile);
const git = async (arguments_) => execute('git', arguments_, { encoding: 'utf8' });
const at = async (directory, ...args) => (await git(['-C', directory, ...args])).stdout.trim();
async function commit(directory, filename, content) {
  await fs.mkdir(path.dirname(path.join(directory, filename)), { recursive: true });
  await fs.writeFile(path.join(directory, filename), content);
  await at(directory, 'add', '--', filename);
  await at(
    directory,
    '-c',
    'user.name=Studio Test',
    '-c',
    'user.email=studio@example.invalid',
    'commit',
    '-m',
    'Test fixture',
  );
  return at(directory, 'rev-parse', 'HEAD');
}

async function fixture(t, options = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-managed-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'Pydicate Studio');
  const repositories = [];
  const sources = {};
  for (const repository of REPOSITORIES) {
    const source = path.join(temporary, `source-${repository.name}`);
    await git(['init', '--initial-branch=main', source]);
    await at(source, 'config', 'uploadpack.allowFilter', 'true');
    for (const required of repository.requiredDirectories)
      await commit(source, `${required}/__init__.py`, '# fixture\n');
    sources[repository.name] = source;
    repositories.push({ ...repository, url: pathToFileURL(source).href });
  }
  const progress = [];
  const settings = {
    directory,
    repositories,
    onProgress: (item) => progress.push(item),
    ...options,
  };
  return {
    temporary,
    directory,
    sources,
    repositories,
    progress,
    settings,
    service: createManagedProjects(settings),
  };
}

test('first setup clones main into the automatic parent, reports progress and is idempotent', async (t) => {
  const value = await fixture(t);
  const before = await value.service.getStatus();
  assert.equal(before.ready, false);
  assert.equal(before.managed, false);
  assert.deepEqual(
    before.repositories.map((item) => item.state),
    ['missing', 'missing'],
  );
  const complete = await value.service.setup();
  assert.equal(complete.ready, true);
  assert.equal(complete.busy, false);
  assert.equal(await value.service.isManaged(value.directory), true);
  assert.equal(await value.service.isManaged(value.temporary), false);
  assert.equal(complete.directory, value.directory);
  assert.ok(
    value.progress.some((item) => item.phase === 'cloning' && item.message.startsWith('Baixando')),
  );
  assert.equal(value.progress.at(-1).phase, 'ready');
  for (const repository of complete.repositories) {
    assert.equal(repository.branch, 'main');
    assert.equal(repository.dirty, false);
    assert.equal(await at(repository.path, 'rev-parse', '--is-shallow-repository'), 'true');
  }
  const again = await value.service.setup();
  assert.deepEqual(again.repositories, complete.repositories);
  assert.equal(
    value.progress.filter(
      (item) =>
        item.phase === 'cloning' &&
        item.message.startsWith('Baixando') &&
        item.percent === undefined,
    ).length,
    2,
  );
  assert.deepEqual(
    (await fs.readdir(value.directory)).filter((name) => name.includes('stage-')),
    [],
  );
});

test('existing unrelated folders and files are preserved without being adopted', async (t) => {
  const value = await fixture(t);
  const protectedFile = path.join(value.directory, 'oldtupicorpus', 'private.txt');
  await fs.mkdir(path.dirname(protectedFile), { recursive: true });
  await fs.writeFile(protectedFile, 'author work');
  await assert.rejects(value.service.setup(), { code: 'MANAGED_PROJECT_EXISTS' });
  assert.equal(await fs.readFile(protectedFile, 'utf8'), 'author work');
  assert.equal((await value.service.getStatus()).ready, false);
  assert.equal((await value.service.getStatus()).managed, false);
});

test('sparse engine checkout includes grammar and dictionary but leaves historical scans out, including after updates', async (t) => {
  const value = await fixture(t);
  const source = value.sources['nhe-enga'];
  await commit(source, 'docs/primary_sources/scans/page.png', 'scan fixture');
  await commit(source, 'docs/dict-conjugated.json.gz', 'dictionary fixture');
  await commit(source, 'js/index.js', '// dictionary UI');
  const initial = await value.service.setup();
  const engine = initial.repositories[1].path;
  assert.equal(
    await fs.readFile(path.join(engine, 'docs/dict-conjugated.json.gz'), 'utf8'),
    'dictionary fixture',
  );
  assert.equal(await fs.readFile(path.join(engine, 'js/index.js'), 'utf8'), '// dictionary UI');
  await assert.rejects(fs.stat(path.join(engine, 'docs/primary_sources/scans/page.png')), {
    code: 'ENOENT',
  });
  await commit(source, 'docs/primary_sources/scans/next.png', 'next scan fixture');
  const head = await commit(source, 'docs/dict-conjugated.json.gz', 'updated dictionary fixture');
  const updated = await value.service.update();
  assert.equal(updated.repositories[1].revision, head);
  assert.equal(
    await fs.readFile(path.join(engine, 'docs/dict-conjugated.json.gz'), 'utf8'),
    'updated dictionary fixture',
  );
  await assert.rejects(fs.stat(path.join(engine, 'docs/primary_sources/scans/next.png')), {
    code: 'ENOENT',
  });
});

test('an interrupted second clone leaves no ready pair and reuses the completed first repository', async (t) => {
  let fail = true;
  const cloned = [];
  const value = await fixture(t, {
    runGit: async (args) => {
      if (args[0] === 'clone') {
        cloned.push(args.at(-2));
        if (fail && args.at(-2).includes('nhe-enga')) {
          await fs.mkdir(args.at(-1));
          await fs.writeFile(path.join(args.at(-1), 'partial'), 'download interrupted');
          throw new Error('offline fixture');
        }
      }
      return git(args);
    },
  });
  await assert.rejects(value.service.setup(), /offline fixture/);
  const partial = await value.service.getStatus();
  assert.equal(partial.ready, false);
  assert.deepEqual(
    partial.repositories.map((item) => item.state),
    ['ready', 'missing'],
  );
  const original = partial.repositories[0].revision;
  fail = false;
  const completed = await value.service.setup();
  assert.equal(completed.ready, true);
  assert.equal(completed.repositories[0].revision, original);
  assert.equal(cloned.filter((url) => url.includes('oldtupicorpus')).length, 1);
  assert.equal(cloned.filter((url) => url.includes('nhe-enga')).length, 2);
});

test('a clone completed before interruption is verified and installed on retry without downloading again', async (t) => {
  let interrupted = false;
  let clones = 0;
  const value = await fixture(t, {
    runGit: async (args) => {
      const result = await git(args);
      if (args[0] === 'clone') {
        clones++;
        if (!interrupted) {
          interrupted = true;
          throw new Error('process interrupted after clone');
        }
      }
      return result;
    },
  });
  await assert.rejects(value.service.setup(), /interrupted/);
  assert.equal((await value.service.getStatus()).ready, false);
  assert.equal((await value.service.setup()).ready, true);
  assert.equal(clones, 2);
});

test('updates a clean shallow main only by fast-forward and retains local uncommitted edits', async (t) => {
  const value = await fixture(t);
  const initial = await value.service.setup();
  const corpus = initial.repositories[0];
  const engine = initial.repositories[1];
  const corpusTarget = await commit(
    value.sources.oldtupicorpus,
    'historic/new.py',
    '# newer corpus',
  );
  const engineTarget = await commit(
    value.sources['nhe-enga'],
    'pydicate/pydicate/new.py',
    '# newer engine',
  );
  const protectedFile = path.join(corpus.path, 'historic/__init__.py');
  const original = await fs.readFile(protectedFile);
  await fs.writeFile(protectedFile, '# author edits');
  const updated = await value.service.update();
  assert.equal(updated.ready, true);
  assert.equal(updated.repositories[0].revision, corpus.revision);
  assert.equal(await fs.readFile(protectedFile, 'utf8'), '# author edits');
  assert.equal(updated.repositories[1].revision, engineTarget);
  assert.ok(updated.warnings.some((message) => message.includes('alterações locais')));
  // Restore the actual checkout bytes, including Git's CRLF conversion on Windows.
  await fs.writeFile(protectedFile, original);
  assert.equal((await value.service.update()).repositories[0].revision, corpusTarget);
});

test('local commits and alternate branches are left exactly where the contributor put them', async (t) => {
  const value = await fixture(t);
  const initial = await value.service.setup();
  const local = await commit(
    initial.repositories[0].path,
    'historic/local.py',
    '# local contribution',
  );
  await at(initial.repositories[1].path, 'checkout', '-b', 'author-review');
  await commit(value.sources.oldtupicorpus, 'historic/remote.py', '# remote contribution');
  const updated = await value.service.update();
  assert.equal(updated.ready, true);
  assert.equal(updated.repositories[0].revision, local);
  assert.equal(updated.repositories[1].branch, 'author-review');
  assert.equal(updated.repositories[1].revision, initial.repositories[1].revision);
  assert.equal(updated.warnings.length, 2);
  assert.ok(updated.warnings.some((message) => message.includes('commits locais')));
});

test('offline launch keeps both existing repositories available and reports the missed update', async (t) => {
  let offline = false;
  const value = await fixture(t, {
    runGit: (args) => {
      if (offline && args.includes('fetch')) throw new Error('network unavailable');
      return git(args);
    },
  });
  const initial = await value.service.setup();
  offline = true;
  const updated = await value.service.update();
  assert.equal(updated.ready, true);
  assert.deepEqual(updated.repositories, initial.repositories);
  assert.equal(updated.warnings.length, 2);
  assert.ok(
    updated.warnings.every((message) => message.includes('cópia local continua disponível')),
  );
});

test('edits arriving during fetch are preserved instead of fast-forwarded over', async (t) => {
  let editDuringFetch = false;
  const value = await fixture(t, {
    runGit: async (args) => {
      const result = await git(args);
      if (editDuringFetch && args.includes('fetch'))
        await fs.writeFile(path.join(args[1], 'author.txt'), 'new unsaved work');
      return result;
    },
  });
  const initial = await value.service.setup();
  await commit(value.sources.oldtupicorpus, 'historic/new.py', '# next');
  editDuringFetch = true;
  const updated = await value.service.update();
  assert.equal(updated.ready, true);
  assert.deepEqual(
    updated.repositories.map((item) => item.revision),
    initial.repositories.map((item) => item.revision),
  );
  assert.ok(updated.warnings.every((message) => message.includes('mudou durante')));
});

test('changed repository origins block automatic writes without replacing the repository', async (t) => {
  const value = await fixture(t);
  const initial = await value.service.setup();
  await at(initial.repositories[0].path, 'remote', 'set-url', 'origin', value.repositories[1].url);
  await assert.rejects(value.service.update(), /origem desta cópia foi alterada/);
  assert.equal(
    await at(initial.repositories[0].path, 'rev-parse', 'HEAD'),
    initial.repositories[0].revision,
  );
});

test('same-service requests coalesce and a second service cannot write under the active lock', async (t) => {
  let release;
  let started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  let once = true;
  const value = await fixture(t, {
    runGit: async (args) => {
      if (once && args[0] === 'clone') {
        once = false;
        started();
        await wait;
      }
      return git(args);
    },
  });
  const first = value.service.setup();
  assert.equal(value.service.setup(), first);
  await entered;
  const other = createManagedProjects(value.settings);
  await assert.rejects(other.setup(), { code: 'MANAGED_PROJECT_BUSY' });
  assert.equal((await value.service.getStatus()).busy, true);
  release();
  assert.equal((await first).ready, true);
  assert.equal((await other.setup()).ready, true);
});

test('a dead process lock is recovered before retrying preparation', async (t) => {
  const value = await fixture(t);
  await fs.mkdir(value.directory);
  await fs.writeFile(
    path.join(value.directory, '.pydicate-studio.lock'),
    JSON.stringify({ pid: 2147483647, token: 'dead-owner' }),
  );
  await fs.writeFile(
    path.join(value.directory, '.pydicate-studio.lock.recovery'),
    JSON.stringify({ pid: 2147483647, token: 'dead-recovery-owner' }),
  );
  assert.equal((await value.service.setup()).ready, true);
  await assert.rejects(fs.stat(path.join(value.directory, '.pydicate-studio.lock')), {
    code: 'ENOENT',
  });
});

test('automatic fast-forward does not execute contributor-installed post-merge hooks', async (t) => {
  const value = await fixture(t);
  const initial = await value.service.setup();
  const corpus = initial.repositories[0].path;
  const output = path.join(corpus, 'hook-executed.txt');
  const hook = path.join(corpus, '.git/hooks/post-merge');
  await fs.writeFile(hook, '#!/bin/sh\necho executed > hook-executed.txt\n', { mode: 0o755 });
  await commit(value.sources.oldtupicorpus, 'historic/new.py', '# newest');
  assert.equal((await value.service.update()).ready, true);
  await assert.rejects(fs.stat(output), { code: 'ENOENT' });
});

test('a preexisting destination symlink is preserved and never traversed for setup', async (t) => {
  const value = await fixture(t);
  await fs.mkdir(value.directory);
  await fs.symlink(
    value.sources.oldtupicorpus,
    path.join(value.directory, 'oldtupicorpus'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const head = await at(value.sources.oldtupicorpus, 'rev-parse', 'HEAD');
  await assert.rejects(value.service.setup(), { code: 'MANAGED_PROJECT_EXISTS' });
  assert.equal(
    (await fs.lstat(path.join(value.directory, 'oldtupicorpus'))).isSymbolicLink(),
    true,
  );
  assert.equal(await at(value.sources.oldtupicorpus, 'rev-parse', 'HEAD'), head);
});
