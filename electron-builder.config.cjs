'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Arch } = require('builder-util');
const macSigned = process.platform === 'darwin' && Boolean(process.env.CSC_LINK);

module.exports = {
  appId: 'org.pydicate.studio',
  productName: 'Pydicate Studio',
  artifactName: 'Pydicate-Studio-${version}-${os}-${arch}.${ext}',
  directories: { output: 'release', buildResources: 'build/icons' },
  icon: 'build/icons/icon.png',
  // Python and bundled Git run outside Electron and need ordinary filesystem
  // paths. The initial distribution intentionally has no ASAR indirection.
  asar: false,
  files: [
    'dist/**',
    'electron/**',
    'python/**',
    'scripts/parser-lab/**',
    'configs/parser-lab/**',
    'package.json',
    '!**/tests/**',
    '!**/__pycache__/**',
    '!**/*.pyc',
  ],
  extraResources: [
    { from: 'build/runtime', to: 'runtime', filter: ['**/*', '!**/__pycache__/**', '!**/*.pyc'] },
  ],
  extraMetadata: { studioUpdate: { macSigned } },
  forceCodeSigning: macSigned,
  beforePack(context) {
    const directory = path.join(context.packager.projectDir, 'build', 'runtime');
    if (!fs.existsSync(directory) || !fs.readdirSync(directory).length)
      throw new Error('Run npm run runtime:prepare before packaging the application.');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    if (
      manifest.version !== 1 ||
      manifest.platform !== context.electronPlatformName ||
      manifest.arch !== Arch[context.arch]
    )
      throw new Error(
        'The prepared runtime does not match the installer platform/architecture. Prepare it on the matching native runner.',
      );
  },
  publish: [
    { provider: 'github', owner: 'kiansheik', repo: 'pydicate-studio', releaseType: 'release' },
  ],
  mac: {
    category: 'public.app-category.education',
    target: ['dmg', 'zip'],
    identity: macSigned ? undefined : '-',
    hardenedRuntime: macSigned,
  },
  win: { target: ['nsis'] },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowElevation: false,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
  },
  linux: { target: ['AppImage'], category: 'Education', executableName: 'pydicate-studio' },
};
