'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { Arch } = require('builder-util');
const { validateConfiguration } = require('app-builder-lib/out/util/config/config');
const root = path.resolve(__dirname, '..', '..');
const workflow = yaml.load(
  fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8'),
);
const aggregation = workflow.jobs.publish.steps.find((step) =>
  step.name?.startsWith('Verify every updater'),
);
const script = aggregation.run.match(/node --input-type=module <<'JS'\n([\s\S]*?)\nJS/)[1];

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
  for (const [platform, arch, ext, manifest] of [
    ['mac', 'arm64', 'zip', 'latest-mac.yml'],
    ['mac', 'x64', 'zip', 'latest-mac.yml'],
    ['win', 'x64', 'exe', 'latest.yml'],
    ['linux', 'x64', 'AppImage', 'latest-linux.yml'],
  ]) {
    const target = path.join(directory, 'release-input', `installer-${platform}-${arch}`);
    fs.mkdirSync(target, { recursive: true });
    const filename = `Pydicate-Studio-0.2.10001-${platform}-${arch}.${ext}`;
    const bytes = Buffer.from(`Disposable ${platform} ${arch} installer fixture`);
    const sha512 = createHash('sha512').update(bytes).digest('base64');
    fs.writeFileSync(path.join(target, filename), bytes);
    fs.writeFileSync(
      path.join(target, manifest),
      yaml.dump({
        version: '0.2.10001',
        files: [{ url: filename, sha512, size: bytes.length }],
        path: filename,
        sha512,
      }),
    );
  }
  return directory;
}
function aggregate(directory) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: directory,
    env: { ...process.env, RELEASE_VERSION: '0.2.10001' },
    stdio: 'pipe',
  });
}

test('installer configuration satisfies the pinned electron-builder schema', async () => {
  await validateConfiguration(require('../../electron-builder.config.cjs'), {
    isEnabled: false,
    add() {},
  });
});

test('packaging rejects an absent or mismatched native runtime before creating an installer', (t) => {
  const directory = fixture(t);
  const config = require('../../electron-builder.config.cjs');
  const context = {
    packager: { projectDir: directory },
    electronPlatformName: 'linux',
    arch: Arch.x64,
  };
  assert.throws(() => config.beforePack(context), /runtime:prepare/);
  const runtime = path.join(directory, 'build', 'runtime');
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(
    path.join(runtime, 'manifest.json'),
    JSON.stringify({ version: 1, platform: 'linux', arch: 'x64' }),
  );
  assert.doesNotThrow(() => config.beforePack(context));
  assert.throws(
    () => config.beforePack({ ...context, arch: Arch.arm64 }),
    /platform\/architecture/,
  );
  assert.throws(
    () => config.beforePack({ ...context, electronPlatformName: 'darwin' }),
    /platform\/architecture/,
  );
});

test('release assembly verifies actual bytes and combines both Mac update architectures', (t) => {
  const directory = fixture(t);
  aggregate(directory);
  const mac = yaml.load(
    fs.readFileSync(path.join(directory, 'release-ready', 'latest-mac.yml'), 'utf8'),
  );
  assert.equal(mac.version, '0.2.10001');
  assert.equal(mac.files.length, 2);
  assert.ok(mac.files.some((file) => file.url.includes('arm64')));
  assert.ok(mac.files.some((file) => file.url.includes('x64')));
  assert.equal(fs.readdirSync(path.join(directory, 'release-ready')).length, 7);
});

test('release assembly rejects a corrupted installer before publication', (t) => {
  const directory = fixture(t);
  const target = path.join(directory, 'release-input', 'installer-win-x64');
  const exe = fs.readdirSync(target).find((file) => file.endsWith('.exe'));
  fs.appendFileSync(path.join(target, exe), 'corrupted');
  assert.throws(() => aggregate(directory), /Checksum mismatch/);
});

test('release assembly rejects an absent platform or a mismatched build version', (t) => {
  const missing = fixture(t);
  fs.rmSync(path.join(missing, 'release-input', 'installer-linux-x64'), { recursive: true });
  assert.throws(() => aggregate(missing), /ENOENT/);
  const mismatch = fixture(t);
  const manifest = path.join(mismatch, 'release-input', 'installer-win-x64', 'latest.yml');
  const text = fs.readFileSync(manifest, 'utf8');
  fs.writeFileSync(manifest, text.replace('version: 0.2.10001', 'version: 0.2.10000'));
  assert.throws(() => aggregate(mismatch), /Invalid update manifest/);
});
