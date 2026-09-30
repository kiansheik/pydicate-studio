import { useEffect, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pdfSupportOptions } from '../domain/pdf-assets';
import { viewportRect, type EvidenceStatus } from '../domain/evidence';
GlobalWorkerOptions.workerSrc = workerUrl;

type Print = { id: string; page: number; crop: string; full: string };
export function SubmissionPdf({
  evidence,
  onReady,
}: {
  evidence: EvidenceStatus;
  onReady: () => void;
}) {
  const [prints, setPrints] = useState<Print[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const assetId = evidence.asset?.id;
    const url =
      assetId &&
      window.studio?.evidenceUrl?.({
        projectId: evidence.projectId,
        sourceId: evidence.sourceId,
        assetId,
      });
    if (!url) {
      setError('O PDF desta linha não está disponível.');
      return;
    }
    const task = getDocument({
      ...pdfSupportOptions(),
      url,
      withCredentials: true,
      disableStream: true,
      disableAutoFetch: true,
      rangeChunkSize: 65536,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    void (async () => {
      const pdf = await task.promise,
        next: Print[] = [];
      const regions = evidence.passage?.regions?.length
        ? evidence.passage.regions
        : [
            {
              id: 'full-page',
              assetId,
              pageIndex: evidence.passage?.view.pageIndex ?? 0,
              rect: null,
            },
          ];
      for (const region of regions) {
        if (!alive) return;
        if (region.assetId !== assetId) continue;
        const page = await pdf.getPage(region.pageIndex + 1);
        const rotation = (page.rotate + (evidence.passage?.view?.rotation ?? 0)) % 360;
        const base = page.getViewport({ scale: 1, rotation });
        const viewport = page.getViewport({ scale: Math.min(3, 1600 / base.width), rotation });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const [left, top, right, bottom] = region.rect
          ? viewportRect(viewport, region.rect)
          : [0, 0, canvas.width, canvas.height];
        if (
          left < -1 ||
          top < -1 ||
          right > canvas.width + 1 ||
          bottom > canvas.height + 1 ||
          right <= left ||
          bottom <= top
        )
          throw new Error('O recorte está fora da página do PDF.');
        const crop = document.createElement('canvas');
        crop.width = Math.ceil(right - left);
        crop.height = Math.ceil(bottom - top);
        crop
          .getContext('2d')!
          .drawImage(canvas, left, top, right - left, bottom - top, 0, 0, crop.width, crop.height);
        const context = canvas.getContext('2d')!;
        context.strokeStyle = '#be302e';
        context.lineWidth = 3;
        if (region.rect) context.strokeRect(left, top, right - left, bottom - top);
        next.push({
          id: region.id,
          page: region.pageIndex + 1,
          crop: crop.toDataURL('image/png'),
          full: canvas.toDataURL('image/png'),
        });
        page.cleanup();
      }
      if (!next.length) throw new Error('Esta linha não tem recorte salvo no PDF.');
      if (alive) {
        setPrints(next);
        onReady();
      }
    })().catch((reason) => {
      if (alive) setError(String(reason.message ?? reason));
    });
    return () => {
      alive = false;
      void task.destroy().catch(() => {});
    };
  }, [evidence, onReady]);
  return (
    <div className="submission-pdf">
      {error && <p role="alert">{error}</p>}
      {!error && !prints.length && <p role="status">Carregando as imagens do PDF…</p>}
      {prints.map((print) => (
        <figure key={print.id}>
          <figcaption>
            Página {print.page} do PDF ·{' '}
            {print.id === 'full-page'
              ? 'página escolhida para conferência, sem recorte salvo'
              : 'recorte salvo desta linha'}
          </figcaption>
          <img src={print.crop} alt={`Recorte da linha na página ${print.page}`} />
          <details>
            <summary>Ver página inteira com o recorte destacado</summary>
            <img src={print.full} alt={`Página ${print.page} do PDF com recorte destacado`} />
          </details>
        </figure>
      ))}
    </div>
  );
}
