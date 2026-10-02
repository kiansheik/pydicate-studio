'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { renderRegion, createEvidenceImages } = require('../evidence-images.cjs');

function fixturePdf(origin = [20, 40]) {
  // Asymmetric red/blue physical target, surrounded by white. Two pages differ
  // only in intrinsic rotation. Nonzero MediaBox and CropBox origin is intentional.
  const stream = '0 0 1 rg 100 300 160 100 re f\n1 0 0 rg 100 300 80 100 re f\n';
  const box = `[${origin[0]} ${origin[1]} ${origin[0] + 400} ${origin[1] + 600}]`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox ${box} /CropBox ${box} /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    `<< /Type /Page /Parent 2 0 R /MediaBox ${box} /CropBox ${box} /Rotate 90 /Contents 4 0 R /Resources << >> >>`,
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(
    pdf + `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF\n`,
  );
}
const region = (pageIndex = 0) => ({
  id: 'region:actual',
  assetId: 'saved-pdf-hash',
  pageIndex,
  rect: [100, 300, 260, 400],
});
async function pixels(bytes) {
  const image = await loadImage(bytes),
    canvas = createCanvas(image.width, image.height),
    context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    at: (x, y) =>
      Array.from(
        context.getImageData(Math.floor(x * image.width), Math.floor(y * image.height), 1, 1).data,
      ),
  };
}

test('actual cropped pixels follow native region, intrinsic/view rotation and nonzero page origins', async () => {
  for (const origin of [
    [0, 0],
    [20, 40],
  ])
    for (const pageIndex of [0, 1])
      for (const rotation of [0, 90, 180, 270]) {
        const image = await renderRegion(fixturePdf(origin), region(pageIndex), { rotation });
        const view = await pixels(image.bytes),
          effective = (pageIndex * 90 + rotation) % 360;
        assert.deepEqual(image.metadata.pageBox, [
          origin[0],
          origin[1],
          origin[0] + 400,
          origin[1] + 600,
        ]);
        assert.equal(image.metadata.rotation, effective);
        assert.equal(image.metadata.intrinsicRotation, pageIndex * 90);
        assert.deepEqual([view.width, view.height], effective % 180 ? [200, 320] : [320, 200]);
        const red = { 0: [0.25, 0.5], 90: [0.5, 0.25], 180: [0.75, 0.5], 270: [0.5, 0.75] }[
          effective
        ];
        const blue = { 0: [0.75, 0.5], 90: [0.5, 0.75], 180: [0.25, 0.5], 270: [0.5, 0.25] }[
          effective
        ];
        assert.deepEqual(
          view.at(...red),
          [255, 0, 0, 255],
          `red landmark origin=${origin} page=${pageIndex} view=${rotation}`,
        );
        assert.deepEqual(
          view.at(...blue),
          [0, 0, 255, 255],
          `blue landmark origin=${origin} page=${pageIndex} view=${rotation}`,
        );
        assert.equal(createHash('sha256').update(image.bytes).digest('hex'), image.metadata.hash);
      }
});

test('crop boundaries, page indexes, dimensions, byte budgets and supported rotation are enforced', async () => {
  const bytes = fixturePdf();
  await assert.rejects(renderRegion(bytes, { ...region(), rect: [0, 0, 10, 10] }), /fora/);
  await assert.rejects(renderRegion(bytes, { ...region(), rect: [100, 300, 100, 400] }), /fora/);
  await assert.rejects(renderRegion(bytes, region(4)), /page|página/i);
  await assert.rejects(renderRegion(bytes, region(), { rotation: 45 }), /rotation|rotação/i);
  const limited = await renderRegion(bytes, region(), { maxDimension: 100 });
  assert.equal(limited.metadata.width, 100);
  assert.equal(limited.metadata.height, 63);
  await assert.rejects(renderRegion(bytes, region(), { maxBytes: 100 }), /limite/i);
});

test('captured pixels survive restart with original geometry and checksum; corrupt saved images reject', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-image-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const service = createEvidenceImages(directory),
    bytes = fixturePdf();
  const images = await service.capture(bytes, [region(1)], 270);
  assert.equal(images.length, 1);
  assert.equal(images[0].rotation, 0);
  assert.deepEqual(images[0].rect, region().rect);
  const reopened = createEvidenceImages(directory),
    content = await reopened.read(images[0]);
  assert.equal(content.type, 'image');
  assert.equal(content.mimeType, 'image/png');
  const image = await pixels(Buffer.from(content.data, 'base64'));
  assert.deepEqual(image.at(0.25, 0.5), [255, 0, 0, 255]);
  assert.equal((await fs.stat(path.join(directory, images[0].hash))).mode & 0o777, 0o600);
  await fs.writeFile(path.join(directory, images[0].hash), 'corrupted');
  await assert.rejects(reopened.read(images[0]), /mudou/);
  await assert.rejects(reopened.read({ ...images[0], hash: '../escape' }), /inválida/);
  await assert.rejects(
    service.capture(
      bytes,
      Array.from({ length: 5 }, () => region()),
    ),
    /quatro/,
  );
});

test('multi-page image capture preserves the explicit reading order', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-image-order-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const service = createEvidenceImages(directory);
  const images = await service.capture(fixturePdf(), [region(1), region(0)]);
  assert.deepEqual(
    images.map((image) => image.pageIndex),
    [1, 0],
  );
  for (const image of images) assert.equal((await service.read(image)).type, 'image');
});

test('text-only capture produces no image claim or blob', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-text-only-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.deepEqual(await createEvidenceImages(directory).capture(Buffer.alloc(0), []), []);
  assert.deepEqual(await fs.readdir(directory), []);
});
