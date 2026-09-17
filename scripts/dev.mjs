import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const force = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 3000);
  force.unref();
  if (children.size === 0) process.exit(code);
  process.exitCode = code;
}

function start(command, args, env = {}) {
  const environment = { ...process.env, ...env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: environment,
  });
  children.add(child);
  child.on('error', (error) => {
    console.error(error.message);
    children.delete(child);
    stop(1);
  });
  child.on('exit', (code) => {
    children.delete(child);
    if (!stopping) stop(code || 0);
  });
  return child;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

try {
  // Launch package entrypoints directly; no shell quoting or process-group orphaning.
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  start(process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort']);
  let available = false;
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:5173/', { signal: AbortSignal.timeout(400) });
      available = response.ok;
    } catch {
      /* Vite is still starting. */
    }
    if (available) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (stopping) process.exitCode = process.exitCode || 0;
  else if (!available) throw new Error('O Vite não iniciou em http://127.0.0.1:5173.');
  else start(require('electron'), [root], { PYDICATE_STUDIO_DEV: '1' });
} catch (error) {
  console.error(error.message);
  stop(1);
}
