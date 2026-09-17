import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environment = { ...process.env, PYDICATE_STUDIO_DEV: '0' };
// Some Electron-hosted developer terminals inherit this switch from their host.
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [root], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  env: environment,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.on('SIGINT', () => child.kill('SIGTERM'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
