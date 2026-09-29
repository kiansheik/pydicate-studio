/**
 * PDF.js keeps its decoders and font data outside the bundle. JBIG2, JPEG 2000
 * and ICC colour are WebAssembly modules; the standard fonts and the predefined
 * CMaps are fetched per document. Scanned witnesses are exactly the documents
 * that need them, and a missing decoder is silent: the worker warns, skips the
 * image and the page renders blank. The build copies these files from
 * `pdfjs-dist` to `/pdfjs` beside the application; the desktop protocol handler
 * and the hosted server both serve that path.
 */
export const supportDirectory = '/pdfjs/';

export interface PdfSupportOptions {
  wasmUrl: string;
  standardFontDataUrl: string;
  cMapUrl: string;
  cMapPacked: boolean;
  iccUrl: string;
}

/** Absolute URLs, so the same options work from any page of the application. */
export function pdfSupportOptions(base: string = document.baseURI): PdfSupportOptions {
  const root = new URL(supportDirectory, base).href;
  return {
    wasmUrl: `${root}wasm/`,
    standardFontDataUrl: `${root}standard_fonts/`,
    cMapUrl: `${root}cmaps/`,
    cMapPacked: true,
    iccUrl: `${root}iccs/`,
  };
}
