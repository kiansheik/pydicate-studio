import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runtimePaths, resolveRuntimeEnvironment } = require('../electron/runtime-environment.cjs');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Official release asset digests, pinned together so updating the runtime is a
// reviewable source change rather than a moving "latest" download during CI.
// https://github.com/astral-sh/python-build-standalone/releases/tag/20260924
export const PYTHON_RELEASE = '20260924';
export const PYTHON_VERSION = '3.13.15';
export const PYTHON_ARTIFACTS = Object.freeze({
  'darwin-arm64': {
    triple: 'aarch64-apple-darwin',
    sha256: '064afb7c2fc0bbf511d886288adf98696af5105e36c138cdf2c199c0146fcf68',
  },
  'darwin-x64': {
    triple: 'x86_64-apple-darwin',
    sha256: '327814efd865a0b6a99c149b12a261e9d0ad409183515c745d41bda2d07282e9',
  },
  'linux-x64': {
    triple: 'x86_64-unknown-linux-gnu',
    sha256: 'd0b640eed27fbdd6f5f2bd33444aee53df2c8863f8b2a96f4094717411e3de9c',
  },
  'win32-x64': {
    triple: 'x86_64-pc-windows-msvc',
    sha256: 'e42fa944748a50e9ff481cbb817ef8a6e3da6fbcf0cf6f29b554e1acb8c7384d',
  },
});

export function pythonArtifact(platform = process.platform, arch = process.arch) {
  const artifact = PYTHON_ARTIFACTS[`${platform}-${arch}`];
  if (!artifact) throw new Error(`No bundled Python is configured for ${platform}/${arch}.`);
  const name = `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${artifact.triple}-install_only_stripped.tar.gz`;
  return {
    ...artifact,
    name,
    url: `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${encodeURIComponent(name)}`,
  };
}

export async function verifyArchive(filename, expected) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  const actual = digest.digest('hex');
  if (actual !== expected)
    throw new Error(
      `Runtime checksum mismatch for ${path.basename(filename)}: expected ${expected}, received ${actual}.`,
    );
  return actual;
}

async function cachedArchive(artifact, directory) {
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, artifact.name);
  try {
    await verifyArchive(filename, artifact.sha256);
    return filename;
  } catch (error) {
    // A present but modified cache is an integrity failure, not a reason to
    // silently accept replacement bytes. Remove it explicitly before retrying.
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = `${filename}.${randomUUID()}.download`;
  try {
    const response = await fetch(artifact.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body)
      throw new Error(`Python download failed: HTTP ${response.status}.`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }));
    await verifyArchive(temporary, artifact.sha256);
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
  return filename;
}

/** Native CI jobs prepare their own target; no host Python or Git is used. */
export async function prepareRuntime({
  projectRoot = repositoryRoot,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  if (platform !== process.platform || arch !== process.arch)
    throw new Error(
      'Prepare the runtime on a native runner for the target platform and architecture.',
    );
  const artifact = pythonArtifact(platform, arch);
  const buildDirectory = path.join(projectRoot, 'build');
  const destination = path.join(buildDirectory, 'runtime');
  const temporary = path.join(buildDirectory, `.runtime-${randomUUID()}`);
  const staging = path.join(temporary, 'runtime');
  const requirements = path.join(projectRoot, 'requirements-runtime.txt');
  const requirementText = await readFile(requirements, 'utf8');
  const dugiteDirectory = path.join(projectRoot, 'node_modules', 'dugite');
  const dugite = JSON.parse(await readFile(path.join(dugiteDirectory, 'package.json'), 'utf8'));
  const archive = await cachedArchive(artifact, path.join(buildDirectory, 'runtime-cache'));
  await mkdir(staging, { recursive: true });
  let previous;
  try {
    const tar = await import('tar');
    await tar.x({
      file: archive,
      cwd: staging,
      strict: true,
      preservePaths: false,
      filter: (name) => name === 'python' || name.startsWith('python/'),
    });
    await cp(path.join(dugiteDirectory, 'git'), path.join(staging, 'git'), {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
    });
    const manifest = {
      version: 1,
      platform,
      arch,
      python: {
        version: PYTHON_VERSION,
        release: PYTHON_RELEASE,
        url: artifact.url,
        sha256: artifact.sha256,
      },
      git: { package: 'dugite', packageVersion: dugite.version },
      requirementsSha256: createHash('sha256').update(requirementText).digest('hex'),
    };
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    const runtime = resolveRuntimeEnvironment({
      isPackaged: true,
      resourcesPath: temporary,
      platform,
      arch,
    });
    if (
      requirementText.split(/\r?\n/).some((line) => line.trim() && !line.trim().startsWith('#'))
    ) {
      execFileSync(
        runtime.python,
        [
          '-I',
          '-m',
          'pip',
          '--isolated',
          '--disable-pip-version-check',
          'install',
          '--require-hashes',
          '--only-binary=:all:',
          '--no-compile',
          '--no-input',
          '-r',
          requirements,
        ],
        { env: runtime.env, stdio: 'inherit', windowsHide: true },
      );
    }
    // Empty PATH proves the bundle supplies both runtimes; sys.executable also
    // proves Python grandchildren keep using the relocatable interpreter.
    const isolated = resolveRuntimeEnvironment({
      isPackaged: true,
      resourcesPath: temporary,
      platform,
      arch,
      env: { ...process.env, PATH: '', Path: '' },
    });
    const probe = execFileSync(
      isolated.python,
      [
        '-I',
        '-c',
        [
          'import ctypes, hashlib, json, sqlite3, ssl, subprocess, sys',
          'sqlite3.connect(":memory:").execute("select 1")',
          'child = subprocess.check_output([sys.executable, "-I", "-c", "import sys; print(sys.version.split()[0])"], text=True).strip()',
          'git = subprocess.check_output(["git", "--version"], text=True).strip()',
          'print(json.dumps({"python": sys.version.split()[0], "childPython": child, "git": git}))',
        ].join('; '),
      ],
      { env: isolated.env, encoding: 'utf8', windowsHide: true },
    );
    const versions = JSON.parse(probe);
    if (versions.python !== PYTHON_VERSION || versions.childPython !== PYTHON_VERSION)
      throw new Error('The prepared runtime did not run the pinned Python version.');
    manifest.git.version = versions.git;
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    // Preserve a prior complete bundle until the newly prepared one passes.
    try {
      await readFile(path.join(destination, 'manifest.json'), 'utf8');
      previous = path.join(buildDirectory, `.runtime-previous-${randomUUID()}`);
      await rename(destination, previous);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rename(staging, destination);
    if (previous) await rm(previous, { recursive: true, force: true });
    console.log(`Prepared ${platform}/${arch}: Python ${versions.python}; ${versions.git}.`);
    return { directory: destination, manifest, ...runtimePaths(destination, platform, arch) };
  } catch (error) {
    if (previous) {
      try {
        await rename(previous, destination);
      } catch {
        /* Retain the backup for diagnosis. */
      }
    }
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index];
    if (!['--platform', '--arch'].includes(name) || !process.argv[index + 1])
      throw new Error(
        'Usage: node scripts/prepare-runtime.mjs [--platform darwin|linux|win32] [--arch x64|arm64]',
      );
    options[name.slice(2)] = process.argv[index + 1];
  }
  await prepareRuntime(options);
}
