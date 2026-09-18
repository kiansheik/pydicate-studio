#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const passageId = value('--passage');
if (!passageId || passageId.startsWith('--')) {
  process.stderr.write(
    'Usage: node scripts/studio-external-analysis.mjs --passage <saved passage id> [--task analyze] [--description "question"] [--print-config]\n',
  );
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-external-request-'));
await fs.chmod(temporary, 0o700);
const responsePath = path.join(temporary, 'response.json');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(
  require('electron'),
  [
    root,
    '--studio-external-analysis',
    passageId,
    '--studio-external-response',
    responsePath,
    '--studio-external-task',
    value('--task') ?? 'analyze',
    '--studio-external-description',
    value('--description') ?? '',
  ],
  { env: environment, detached: true, stdio: 'ignore' },
);
let launchError;
child.on('error', (error) => {
  launchError = error;
});
child.unref();
try {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    try {
      const response = JSON.parse(await fs.readFile(responsePath, 'utf8'));
      if (response.error)
        throw Object.assign(new Error(response.error.message ?? String(response.error)), {
          code: response.error.code,
        });
      if (!response.configPath)
        throw new Error('The Studio owner did not return an MCP configuration.');
      if (args.includes('--print-config'))
        process.stdout.write((await fs.readFile(response.configPath, 'utf8')) + '\n');
      else
        process.stdout.write(
          JSON.stringify({
            jobId: response.jobId,
            configPath: response.configPath,
            expiresAt: response.expiresAt,
          }) + '\n',
        );
      process.exitCode = 0;
      break;
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (process.exitCode !== 0)
    throw new Error(
      'Studio did not return a scoped connection within 90 seconds. Open its saved project and inspect the analysis queue.',
    );
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
