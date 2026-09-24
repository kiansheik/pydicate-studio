import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveRuntimeEnvironment } = require('../electron/runtime-environment.cjs');
const { createManagedProjects } = require('../electron/managed-projects.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolveRuntimeEnvironment({
  isPackaged: true,
  resourcesPath: path.join(root, 'build'),
  env: { ...process.env, PATH: '', Path: '' },
});
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-installed-project-'));
const projects = createManagedProjects({ directory, gitExecutable: runtime.git, env: runtime.env });
try {
  const status = await projects.setup();
  if (!status.ready) throw new Error('The bundled Git did not prepare a complete project.');
  console.log(JSON.stringify({ directory, repositories: status.repositories }, null, 2));
  if (process.env.GITHUB_ENV)
    await fs.appendFile(process.env.GITHUB_ENV, `STUDIO_SMOKE_PROJECT=${directory}\n`);
  // The subsequent packaged-app probe consumes this disposable project; native
  // CI tears it down with the runner after both checks finish.
} catch (error) {
  await fs.rm(directory, { recursive: true, force: true });
  throw error;
}
