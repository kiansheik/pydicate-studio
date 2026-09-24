'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const REPOSITORIES = Object.freeze([
  {
    name: 'oldtupicorpus',
    url: 'https://github.com/kiansheik/oldtupicorpus.git',
    requiredDirectories: ['historic'],
  },
  {
    name: 'nhe-enga',
    url: 'https://github.com/kiansheik/nhe-enga.git',
    requiredDirectories: ['pydicate/pydicate', 'tupi/tupi'],
    // Historical page scans account for several GB. The local dictionary and
    // both engine packages remain available; PDF evidence is imported separately.
    sparsePaths: [
      '/*',
      '!/*/',
      '/pydicate/',
      '/tupi/',
      '/js/',
      '/docs/dict-conjugated.json.gz',
      '/docs/primary_sources/index.html',
      '/docs/primary_sources/image-formats.json',
    ],
  },
]);
const OWNER_FILE = '.pydicate-studio-managed.json';
const REPOSITORY_OWNER = 'pydicate-studio-owner.json';

function failure(message, code = 'MANAGED_PROJECT_ERROR') {
  return Object.assign(new Error(message), { code });
}

async function statOrNull(file) {
  try {
    return await fs.lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function gitRunner(executable, environment) {
  return (arguments_, options = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(executable, arguments_, {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...environment,
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
          GIT_OPTIONAL_LOCKS: '0',
        },
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(
        () => {
          timedOut = true;
          child.kill();
        },
        options.timeout ?? 15 * 60_000,
      );
      child.stdout.on('data', (chunk) => {
        stdout = (stdout + chunk.toString('utf8')).slice(-2 * 1024 * 1024);
      });
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stderr = (stderr + text).slice(-16_384);
        for (const match of text.matchAll(/(?:Receiving objects|Updating files):\s+(\d+)%/g))
          options.onPercent?.(Number(match[1]));
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(failure(`Não foi possível iniciar o Git. ${error.message}`, 'GIT_UNAVAILABLE'));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else
          reject(
            failure(
              timedOut
                ? 'O download demorou demais. Tente novamente.'
                : stderr.trim() || 'O Git não concluiu a operação.',
              timedOut ? 'GIT_TIMEOUT' : 'GIT_FAILED',
            ),
          );
      });
    });
}

/** Only repositories created by this service are updated automatically.
 * All Git writes run under a workspace lock; source edits and local commits
 * are never reset, stashed or checked out onto a different branch. */
function createManagedProjects({
  directory,
  gitExecutable = process.env.PYDICATE_GIT || 'git',
  env,
  runGit,
  repositories = REPOSITORIES,
  onProgress = () => {},
}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory))
    throw failure('A pasta padrão do projeto precisa ser um caminho absoluto.');
  directory = path.resolve(directory);
  const ownerPath = path.join(directory, OWNER_FILE);
  const lockPath = path.join(directory, '.pydicate-studio.lock');
  const git = runGit ?? gitRunner(gitExecutable, env);
  let running;
  let warnings = [];
  let progress = { phase: 'idle', message: 'Pronto para preparar o projeto.' };
  const report = (phase, message, repository, percent) => {
    progress = {
      phase,
      message,
      ...(repository ? { repository } : {}),
      ...(percent === undefined ? {} : { percent }),
    };
    // Rendering a progress message must never interrupt an installation.
    try {
      onProgress({ ...progress });
    } catch {}
  };

  async function owner() {
    const stat = await statOrNull(ownerPath);
    if (!stat) return null;
    if (!stat.isFile() || stat.isSymbolicLink())
      throw failure('A identificação da pasta padrão não é um arquivo regular.');
    let value;
    try {
      value = JSON.parse(await fs.readFile(ownerPath, 'utf8'));
    } catch {
      throw failure(
        'A identificação da pasta padrão está incompleta. Escolha outra pasta existente.',
      );
    }
    if (value.version !== 1 || !/^[0-9a-f-]{36}$/.test(value.id))
      throw failure('A identificação da pasta padrão não é compatível com este aplicativo.');
    return value;
  }

  const command = async (repo, ...args) => {
    const result = await git(['-C', repo, ...args], { timeout: 60_000 });
    return result.stdout.trim();
  };

  async function inspect(
    repository,
    identity,
    location = path.join(directory, repository.name),
    staged = false,
  ) {
    const result = { name: repository.name, path: location, url: repository.url, state: 'missing' };
    const stat = await statOrNull(location);
    if (!stat) return result;
    if (!stat.isDirectory() || stat.isSymbolicLink())
      return {
        ...result,
        state: 'unmanaged',
        message: 'Este caminho já existe e não é uma cópia gerenciada.',
      };
    const gitDirectory = path.join(location, '.git');
    const gitStat = await statOrNull(gitDirectory);
    if (!gitStat?.isDirectory() || gitStat.isSymbolicLink())
      return {
        ...result,
        state: 'unmanaged',
        message: 'A pasta existente não foi preparada pelo Studio.',
      };
    if (!staged) {
      let marker;
      try {
        marker = JSON.parse(await fs.readFile(path.join(gitDirectory, REPOSITORY_OWNER), 'utf8'));
      } catch {}
      if (
        !identity ||
        marker?.workspace !== identity.id ||
        marker?.name !== repository.name ||
        marker?.url !== repository.url
      )
        return {
          ...result,
          state: 'unmanaged',
          message: 'A pasta existente será preservada. Abra-a como projeto existente.',
        };
    }
    try {
      if ((await command(location, 'remote', 'get-url', 'origin')) !== repository.url)
        throw failure(
          'A origem desta cópia foi alterada; a atualização automática foi interrompida.',
        );
      for (const relative of repository.requiredDirectories ?? []) {
        const required = await statOrNull(path.join(location, relative));
        if (!required?.isDirectory() || required.isSymbolicLink())
          throw failure(`A cópia não contém o módulo necessário: ${relative}.`);
      }
      const revision = await command(location, 'rev-parse', 'HEAD');
      const branch = await command(location, 'branch', '--show-current');
      const dirty = Boolean(
        await command(location, 'status', '--porcelain', '--untracked-files=normal'),
      );
      return { ...result, state: 'ready', revision, branch, dirty };
    } catch (error) {
      return { ...result, state: 'invalid', message: error.message };
    }
  }

  async function getStatus() {
    let identity;
    let identityError;
    try {
      identity = await owner();
    } catch (error) {
      identityError = error.message;
    }
    const items = await Promise.all(
      repositories.map((repository) => inspect(repository, identity)),
    );
    return {
      directory,
      managed: Boolean(identity),
      ready: Boolean(identity) && items.every((item) => item.state === 'ready'),
      busy: Boolean(running),
      repositories: items,
      warnings: [...warnings, ...(identityError ? [identityError] : [])],
      progress: { ...progress },
    };
  }

  async function installExclusive(file, content) {
    // Publish complete metadata atomically. A crash cannot leave an empty
    // owner/lock file that permanently blocks the next launch.
    const candidate = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(candidate, content, { flag: 'wx', mode: 0o600 });
    try {
      await fs.link(candidate, file);
    } finally {
      await fs.unlink(candidate);
    }
  }

  const busy = () =>
    failure(
      'Outro Studio está preparando este projeto. Aguarde a conclusão.',
      'MANAGED_PROJECT_BUSY',
    );
  async function deadLock(file) {
    let existing;
    try {
      existing = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      return false;
    }
    if (!Number.isInteger(existing?.pid) || existing.pid <= 0) return false;
    try {
      process.kill(existing.pid, 0);
    } catch (error) {
      return error.code === 'ESRCH';
    }
    return false;
  }
  async function acquireLock(file, depth = 0) {
    const token = randomUUID();
    try {
      await installExclusive(file, JSON.stringify({ pid: process.pid, token }));
      return async () => {
        let current;
        try {
          current = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch {
          return;
        }
        if (current.token === token) await fs.unlink(file);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (depth >= 3 || !(await deadLock(file))) throw busy();
      // Recovery itself has an owner, so interrupted recovery can be resumed.
      // Only its holder may remove a dead main lock; fresh locks remain intact.
      const releaseRecovery = await acquireLock(`${file}.recovery`, depth + 1);
      try {
        if (await deadLock(file)) await fs.unlink(file);
      } finally {
        await releaseRecovery();
      }
      return acquireLock(file, depth);
    }
  }
  async function lock() {
    await fs.mkdir(directory, { recursive: true });
    return acquireLock(lockPath);
  }

  async function ensureOwner() {
    const existing = await owner();
    if (existing) return existing;
    for (const repository of repositories)
      if (await statOrNull(path.join(directory, repository.name)))
        throw failure(
          'A pasta padrão já contém arquivos de projeto. Use “Abrir pasta existente” para preservá-los.',
          'MANAGED_PROJECT_EXISTS',
        );
    const identity = { version: 1, id: randomUUID() };
    await installExclusive(ownerPath, JSON.stringify(identity) + '\n');
    return identity;
  }

  async function clone(repository, identity) {
    const destination = path.join(directory, repository.name);
    const staging = path.join(
      directory,
      `.pydicate-studio-stage-${repository.name}-${identity.id}`,
    );
    let staged = await inspect(repository, identity, staging, true);
    if (staged.state !== 'ready' || staged.branch !== 'main' || staged.dirty) {
      const stat = await statOrNull(staging);
      if (stat?.isSymbolicLink())
        throw failure('O caminho temporário do download foi substituído.');
      if (stat) await fs.rm(staging, { recursive: true });
      report('cloning', `Baixando ${repository.name}…`, repository.name);
      await git(
        [
          'clone',
          '--depth',
          '1',
          '--single-branch',
          '--branch',
          'main',
          '--no-recurse-submodules',
          ...(repository.sparsePaths ? ['--filter=blob:none', '--no-checkout'] : []),
          '--progress',
          '--',
          repository.url,
          staging,
        ],
        {
          timeout: 15 * 60_000,
          onPercent: (percent) =>
            report('cloning', `Baixando ${repository.name}…`, repository.name, percent),
        },
      );
      if (repository.sparsePaths) {
        report(
          'cloning',
          `Preparando a gramática e o dicionário de ${repository.name}…`,
          repository.name,
        );
        await git(
          ['-C', staging, 'sparse-checkout', 'set', '--no-cone', '--', ...repository.sparsePaths],
          { timeout: 15 * 60_000 },
        );
        await git(['-C', staging, 'checkout', 'main'], { timeout: 15 * 60_000 });
      }
      staged = await inspect(repository, identity, staging, true);
    }
    if (staged.state !== 'ready' || staged.branch !== 'main' || staged.dirty)
      throw failure(`O download de ${repository.name} não está completo. Tente novamente.`);
    await fs.writeFile(
      path.join(staging, '.git', REPOSITORY_OWNER),
      JSON.stringify({ workspace: identity.id, name: repository.name, url: repository.url }) + '\n',
    );
    if (await statOrNull(destination))
      throw failure(`A pasta ${repository.name} apareceu durante o download e foi preservada.`);
    await fs.rename(staging, destination);
  }

  async function updateRepository(repository, identity, before) {
    const location = before.path;
    if (before.dirty)
      return `${repository.name}: suas alterações locais foram preservadas; a atualização ficou para depois.`;
    if (before.branch !== 'main')
      return `${repository.name}: a branch ${before.branch || 'destacada'} foi preservada; a atualização automática usa main.`;
    if (Number(await command(location, 'rev-list', '--count', 'origin/main..HEAD')) > 0)
      return `${repository.name}: seus commits locais foram preservados; concilie-os antes de atualizar.`;
    report('updating', `Verificando atualizações de ${repository.name}…`, repository.name);
    try {
      // Keep the existing shallow boundary: --depth=1 here would discard the
      // ancestry that proves a future main commit is a safe fast-forward.
      await git(
        [
          '-C',
          location,
          'fetch',
          '--no-tags',
          'origin',
          'refs/heads/main:refs/remotes/origin/main',
        ],
        { timeout: 120_000 },
      );
    } catch {
      return `${repository.name}: não foi possível buscar atualizações. A cópia local continua disponível.`;
    }
    const current = await inspect(repository, identity);
    if (
      current.state !== 'ready' ||
      current.dirty ||
      current.branch !== 'main' ||
      current.revision !== before.revision
    )
      return `${repository.name}: o projeto mudou durante a busca; seus arquivos foram preservados.`;
    if (Number(await command(location, 'rev-list', '--count', 'origin/main..HEAD')) > 0)
      return `${repository.name}: os históricos precisam ser conciliados; seus commits foram preservados.`;
    const target = await command(location, 'rev-parse', 'origin/main');
    if (target === current.revision) return null;
    // Empty hooks are internal to .git, so they never dirty the contributor's
    // working tree and an installed post-merge hook cannot run on launch.
    const hooks = await fs.mkdtemp(path.join(location, '.git', 'pydicate-empty-hooks-'));
    try {
      await git(
        [
          '-C',
          location,
          '-c',
          `core.hooksPath=${hooks}`,
          'merge',
          '--ff-only',
          '--no-edit',
          target,
        ],
        { timeout: 60_000 },
      );
    } catch {
      return `${repository.name}: não foi possível aplicar a atualização sem conciliar o projeto. A cópia local foi preservada.`;
    } finally {
      await fs.rm(hooks, { recursive: true });
    }
    return null;
  }

  function prepare(updateExisting) {
    if (running) return running;
    running = (async () => {
      let release;
      warnings = [];
      try {
        release = await lock();
        report('checking', 'Conferindo a pasta padrão do projeto…');
        const identity = await ensureOwner();
        const initial = await Promise.all(
          repositories.map((repository) => inspect(repository, identity)),
        );
        const invalid = initial.find((item) => !['ready', 'missing'].includes(item.state));
        if (invalid) throw failure(`${invalid.name}: ${invalid.message}`, 'MANAGED_PROJECT_EXISTS');
        for (let index = 0; index < repositories.length; index++) {
          if (initial[index].state === 'missing') await clone(repositories[index], identity);
          else if (updateExisting) {
            const warning = await updateRepository(repositories[index], identity, initial[index]);
            if (warning) warnings.push(warning);
          }
        }
        const status = await getStatus();
        if (!status.ready)
          throw failure('O projeto ainda não foi preparado completamente. Tente novamente.');
        report(
          'ready',
          warnings.length ? 'Projeto disponível com a cópia local.' : 'Projeto pronto para abrir.',
        );
        return { ...status, busy: false, warnings: [...warnings], progress: { ...progress } };
      } catch (error) {
        report('error', error.message);
        throw error;
      } finally {
        await release?.();
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    getStatus,
    setup: () => prepare(false),
    update: () => prepare(true),
    isManaged: async (parentPath) =>
      typeof parentPath === 'string' &&
      path.resolve(parentPath) === directory &&
      Boolean(await owner()),
  };
}

module.exports = { createManagedProjects, REPOSITORIES };
