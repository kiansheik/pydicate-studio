import { build } from 'esbuild';

// Ship the same canvas transforms to the Node server without a runtime TypeScript compiler.
await build({
  entryPoints: ['runtime/authoring/shared-entry.ts'],
  outfile: 'runtime/authoring/shared-bundle.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
});
