import { GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createCachedPdfTask, type CachedPdfOptions } from '../src/domain/pdf-document';

GlobalWorkerOptions.workerSrc = workerUrl;
declare global {
  interface Window {
    pdfCacheTest: (options: CachedPdfOptions) => Promise<string>;
  }
}
window.pdfCacheTest = async (options) => {
  const task = createCachedPdfTask(options);
  try {
    const pdf = await task.promise,
      page = await pdf.getPage(1),
      viewport = page.getViewport({ scale: 1 });
    const canvas = document.getElementById('scan') as HTMLCanvasElement;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL();
  } finally {
    await task.destroy();
  }
};
