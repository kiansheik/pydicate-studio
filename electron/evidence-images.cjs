'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** Render in unrotated PDF coordinates, including page origins and intrinsic rotation. */
async function renderRegion(
  bytes,
  region,
  { rotation = 0, maxDimension = 1600, maxBytes = 500000 } = {},
) {
  const { createCanvas } = require('@napi-rs/canvas');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
  });
  let pdf;
  try {
    pdf = await loading.promise;
    const page = await pdf.getPage(region.pageIndex + 1);
    const view = page.view;
    const rect = region.rect;
    if (
      !Array.isArray(rect) ||
      rect.length !== 4 ||
      rect.some((n) => !Number.isFinite(n)) ||
      rect[0] >= rect[2] ||
      rect[1] >= rect[3] ||
      rect[0] < view[0] ||
      rect[1] < view[1] ||
      rect[2] > view[2] ||
      rect[3] > view[3]
    )
      throw new Error('A região está fora da caixa física da página PDF.');
    const effectiveRotation = (((page.rotate + rotation) % 360) + 360) % 360;
    const initial = page.getViewport({ scale: 1, rotation: effectiveRotation });
    const projected = initial.convertToViewportRectangle(rect);
    const width = Math.abs(projected[2] - projected[0]),
      height = Math.abs(projected[3] - projected[1]);
    if (!width || !height) throw new Error('A região não tem área visível.');
    const scale = Math.min(2, maxDimension / Math.max(width, height));
    const viewport = page.getViewport({ scale, rotation: effectiveRotation });
    const projectedScaled = viewport.convertToViewportRectangle(rect);
    const x = Math.min(projectedScaled[0], projectedScaled[2]),
      y = Math.min(projectedScaled[1], projectedScaled[3]);
    const canvas = createCanvas(
      Math.max(1, Math.ceil(width * scale)),
      Math.max(1, Math.ceil(height * scale)),
    );
    const context = canvas.getContext('2d');
    await page.render({
      canvasContext: context,
      viewport,
      transform: [1, 0, 0, 1, -x, -y],
      background: 'rgb(255,255,255)',
    }).promise;
    let image = canvas.toBuffer('image/png'),
      mimeType = 'image/png';
    if (image.length > maxBytes) {
      image = canvas.toBuffer('image/jpeg', 85);
      mimeType = 'image/jpeg';
    }
    if (image.length > maxBytes)
      throw new Error('O recorte excedeu o limite de imagem. Selecione uma região menor.');
    return {
      bytes: image,
      metadata: {
        regionId: region.id,
        assetId: region.assetId,
        pageIndex: region.pageIndex,
        rect: [...rect],
        pageBox: [...view],
        intrinsicRotation: page.rotate,
        viewRotation: rotation,
        rotation: effectiveRotation,
        width: canvas.width,
        height: canvas.height,
        scale,
        mimeType,
        hash: hash(image),
        regionHash: hash(JSON.stringify({ region, rotation })),
        bytes: image.length,
      },
    };
  } finally {
    if (pdf) await pdf.destroy();
    else await loading.destroy();
  }
}
function createEvidenceImages(directory) {
  return {
    async capture(bytes, regions, rotation = 0) {
      if (regions.length > 4)
        throw new Error('Selecione no máximo quatro regiões para uma análise com imagens.');
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const images = [];
      for (const region of regions) {
        const image = await renderRegion(bytes, region, { rotation });
        const filename = path.join(directory, image.metadata.hash),
          temporary = filename + '.' + randomUUID() + '.tmp';
        try {
          const file = await fs.open(temporary, 'wx', 0o600);
          try {
            await file.writeFile(image.bytes);
            await file.sync();
          } finally {
            await file.close();
          }
          await fs.rename(temporary, filename);
        } finally {
          await fs.rm(temporary, { force: true });
        }
        images.push(image.metadata);
      }
      return images;
    },
    async read(metadata) {
      if (!/^[a-f0-9]{64}$/.test(metadata.hash)) throw new Error('Identidade de imagem inválida.');
      const filename = path.join(directory, metadata.hash),
        stat = await fs.stat(filename);
      if (stat.size > 500000) throw new Error('Imagem excede o limite.');
      const bytes = await fs.readFile(filename);
      if (hash(bytes) !== metadata.hash)
        throw new Error('O recorte salvo mudou; a análise foi preservada.');
      return { type: 'image', mimeType: metadata.mimeType, data: bytes.toString('base64') };
    },
  };
}
module.exports = { renderRegion, createEvidenceImages };
