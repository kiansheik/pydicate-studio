import { createReadStream } from 'node:fs';
import { cp, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const packageDirectory = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
// JBIG2, JPEG 2000 and ICC decoding, the standard fonts and the predefined
// CMaps are fetched at runtime; see src/domain/pdf-assets.ts. Scanned witnesses
// need them, and PDF.js skips an undecodable image instead of failing, so a
// missing file shows as a blank page.
const supportDirectories = ['wasm', 'cmaps', 'standard_fonts', 'iccs'];
const TYPES: Record<string, string> = { '.wasm': 'application/wasm', '.js': 'text/javascript' };

function pdfSupportFiles(): Plugin {
  return {
    name: 'pdfjs-support-files',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url || '/', 'http://localhost').pathname;
        const match = /^\/pdfjs\/([a-z_]+)\/([A-Za-z0-9_.-]+)$/.exec(path);
        if (!match || !supportDirectories.includes(match[1])) return next();
        const file = resolve(packageDirectory, match[1], match[2]);
        if (relative(packageDirectory, file).startsWith('..')) return next();
        void stat(file).then(
          () => {
            response.setHeader(
              'Content-Type',
              TYPES[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream',
            );
            createReadStream(file).pipe(response);
          },
          () => next(),
        );
      });
    },
    async writeBundle(options) {
      for (const directory of supportDirectories)
        await cp(
          join(packageDirectory, directory),
          join(options.dir || 'dist', 'pdfjs', directory),
          { recursive: true },
        );
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfSupportFiles()],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
