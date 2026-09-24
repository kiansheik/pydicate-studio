'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_TARGETS = new Set(['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']);
const PYTHON_ENVIRONMENT = new Set([
  'PYTHONHOME',
  'PYTHONPATH',
  'PYTHONUSERBASE',
  'PYTHONSTARTUP',
  'PYTHONINSPECT',
  'VIRTUAL_ENV',
  'CONDA_PREFIX',
  '__PYVENV_LAUNCHER__',
]);

function runtimePaths(directory, platform = process.platform, arch = process.arch) {
  if (!SUPPORTED_TARGETS.has(`${platform}-${arch}`))
    throw new Error(`Runtime não disponível para ${platform}/${arch}.`);
  const pythonDirectory = path.join(directory, 'python');
  const gitDirectory = path.join(directory, 'git');
  const windows = platform === 'win32';
  const gitPrefix = windows ? path.join(gitDirectory, 'mingw64') : gitDirectory;
  return {
    pythonDirectory,
    python: path.join(pythonDirectory, ...(windows ? ['python.exe'] : ['bin', 'python3'])),
    gitDirectory,
    git: path.join(gitDirectory, ...(windows ? ['cmd', 'git.exe'] : ['bin', 'git'])),
    gitExecPath: path.join(gitPrefix, 'libexec', 'git-core'),
    gitTemplateDirectory: path.join(gitPrefix, 'share', 'git-core', 'templates'),
    gitSystemConfig: path.join(gitDirectory, 'etc', 'gitconfig'),
    gitCertificate: path.join(gitDirectory, 'ssl', 'cacert.pem'),
    binaryDirectories: windows
      ? [
          path.join(gitDirectory, 'cmd'),
          path.join(gitPrefix, 'bin'),
          path.join(gitDirectory, 'usr', 'bin'),
        ]
      : [path.join(gitDirectory, 'bin')],
  };
}

/** Resolve once before creating workers. Packaged apps never fall back to a
 * developer's Python, Git or virtual environment. Every child receives the same
 * paths, including Python subprocesses launched through sys.executable. */
function resolveRuntimeEnvironment({
  isPackaged = false,
  resourcesPath = process.resourcesPath,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
} = {}) {
  const environment = { ...env };
  const directory = isPackaged
    ? path.join(resourcesPath || '', 'runtime')
    : env.PYDICATE_RUNTIME_DIR;
  if (!directory) {
    return {
      bundled: false,
      python: env.PYDICATE_PYTHON || 'python3',
      git: env.PYDICATE_GIT || 'git',
      env: environment,
    };
  }
  if (isPackaged && !resourcesPath) throw new Error('O aplicativo não encontrou seus recursos.');
  const locations = runtimePaths(directory, platform, arch);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error('O runtime integrado não está completo. Reinstale o Pydicate Studio.');
  }
  if (
    manifest.version !== 1 ||
    manifest.platform !== platform ||
    manifest.arch !== arch ||
    !fs.existsSync(locations.python) ||
    !fs.existsSync(locations.git) ||
    !fs.existsSync(locations.gitExecPath)
  )
    throw new Error(
      'O runtime integrado não corresponde a este aplicativo. Reinstale o Pydicate Studio.',
    );

  // Windows environment names are case-insensitive; duplicate Path/PATH keys
  // can otherwise cause Node or a Python grandchild to choose the host tools.
  const inheritedPath =
    Object.entries(environment).find(([key]) => key.toUpperCase() === 'PATH')?.[1] || '';
  for (const key of Object.keys(environment))
    if (
      key.toUpperCase().startsWith('PYTHON') ||
      PYTHON_ENVIRONMENT.has(key.toUpperCase()) ||
      key.toUpperCase() === 'PATH' ||
      [
        'LOCAL_GIT_DIRECTORY',
        'GIT_EXEC_PATH',
        'GIT_TEMPLATE_DIR',
        'GIT_CONFIG_SYSTEM',
        'GIT_DIR',
        'GIT_WORK_TREE',
        'GIT_INDEX_FILE',
        'GIT_OBJECT_DIRECTORY',
        'GIT_ALTERNATE_OBJECT_DIRECTORIES',
        'GIT_COMMON_DIR',
        'PYDICATE_PYTHON',
        'PYDICATE_GIT',
        'PYDICATE_RUNTIME_DIR',
      ].includes(key.toUpperCase())
    )
      delete environment[key];
  const delimiter = platform === 'win32' ? ';' : ':';
  environment.PATH = [path.dirname(locations.python), ...locations.binaryDirectories, inheritedPath]
    .filter(Boolean)
    .join(delimiter);
  environment.PYDICATE_PYTHON = locations.python;
  environment.PYDICATE_GIT = locations.git;
  environment.PYTHONNOUSERSITE = '1';
  environment.PYTHONDONTWRITEBYTECODE = '1';
  environment.PYTHONUNBUFFERED = '1';
  environment.PYTHONIOENCODING = 'utf-8';
  environment.PYTHONUTF8 = '1';
  environment.GIT_EXEC_PATH = locations.gitExecPath;
  environment.GIT_TEMPLATE_DIR = locations.gitTemplateDirectory;
  if (platform !== 'win32') environment.GIT_CONFIG_SYSTEM = locations.gitSystemConfig;
  if (platform === 'linux') {
    environment.PREFIX = locations.gitDirectory;
    if (!environment.GIT_SSL_CAINFO) environment.GIT_SSL_CAINFO = locations.gitCertificate;
  }
  return {
    bundled: true,
    directory,
    python: locations.python,
    git: locations.git,
    env: environment,
    manifest,
  };
}

/** Apply the resolved environment before modules capture subprocess defaults. */
function configureRuntimeEnvironment(options = {}) {
  const runtime = resolveRuntimeEnvironment(options);
  for (const key of Object.keys(process.env)) if (!(key in runtime.env)) delete process.env[key];
  Object.assign(process.env, runtime.env);
  return runtime;
}

module.exports = { runtimePaths, resolveRuntimeEnvironment, configureRuntimeEnvironment };
