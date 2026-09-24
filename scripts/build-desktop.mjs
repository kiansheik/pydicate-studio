import { build } from 'esbuild';

// Ship the same canvas transforms to Electron without a runtime TypeScript compiler.
await build({
  entryPoints: ['electron/authoring/shared-entry.ts'],
  outfile: 'electron/authoring/shared-bundle.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
});
