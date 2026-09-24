import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Reuse the checked-in Studio mark; electron-builder converts this full-size
// transparent PNG to the native ICNS/ICO and Linux icon sizes at package time.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'build', 'icons');
const mark = await loadImage(await fs.readFile(path.join(root, 'public', 'mark.svg')));
const canvas = createCanvas(1024, 1024);
canvas.getContext('2d').drawImage(mark, 0, 0, 1024, 1024);
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(path.join(directory, 'icon.png'), await canvas.encode('png'));
