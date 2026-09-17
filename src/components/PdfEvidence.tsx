import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PageViewport,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  pdfRect,
  viewportRect,
  inheritEvidence,
  guideEvidence,
  validWorkingEvidence,
  type EvidencePointer,
  type EvidenceStatus,
  type EvidenceView,
  type PdfRect,
  type WorkingEvidence,
} from '../domain/evidence';
import '../evidence.css';

GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  projectId: string;
  sourceId: string;
  passageId: string;
  previousPassageId?: string;
  newPassageGuide?: boolean;
  disabled?: boolean;
  initialPage?: number | null;
  printedPage?: string | null;
  folio?: string | null;
  lineLocator?: string | null;
  /** A proposed source-comment pointer; applying it remains a separate review action. */
  onEvidence?: (pointer: EvidencePointer) => void;
}
interface Gesture {
  id: string;
  kind: 'draw' | 'move' | 'nw' | 'ne' | 'sw' | 'se';
  start: [number, number];
  original: PdfRect;
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const emptyView = (page = 1): EvidenceView => ({
  pageIndex: Math.max(0, page - 1),
  zoom: 1,
  rotation: 0,
});

export function PdfEvidence({
  projectId,
  sourceId,
  passageId,
  previousPassageId,
  newPassageGuide,
  disabled,
  initialPage,
  printedPage,
  folio,
  lineLocator,
  onEvidence,
}: Props) {
  const key = JSON.stringify([projectId, sourceId, passageId]);
  const cacheKey = `pydicate-studio:evidence-draft:v1:${key}`;
  const lastVisitedKey = `pydicate-studio:evidence-last-passage:v1:${JSON.stringify([projectId, sourceId])}`;
  const activeKey = useRef(key);
  const loadedKey = useRef<string | null>(null);
  activeKey.current = key;
  const [status, setStatus] = useState<EvidenceStatus | null>(null);
  const [working, setWorking] = useState<WorkingEvidence | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [rendering, setRendering] = useState(false);
  const [width, setWidth] = useState(500);
  const [drawing, setDrawing] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const params = { projectId, sourceId, passageId, previousPassageId, newPassageGuide };
  const view = working?.view || emptyView(initialPage ?? 1);
  const regions = working?.regions || [];
  const assetId = status?.asset?.id;
  const available = Boolean(window.studio?.invoke);

  function acceptStatus(next: EvidenceStatus, restoreDraft: boolean) {
    loadedKey.current = key;
    setStatus(next);
    const boundRegions =
      next.passage?.regions.filter((region) => region.assetId === next.asset?.id) || [];
    const savedView =
      next.passage && (!next.passage.viewAssetId || next.passage.viewAssetId === next.asset?.id)
        ? next.passage.view
        : emptyView(initialPage ?? 1);
    let nextWorking: WorkingEvidence | null = next.asset
      ? {
          assetId: next.asset.id,
          revision: next.revision,
          regions: boundRegions,
          view: savedView,
          baseline: JSON.stringify(next.passage),
          ...(next.passage?.guide?.assetId === next.asset.id ? { guide: next.passage.guide } : {}),
        }
      : null;
    let restored = false;
    if (restoreDraft && nextWorking) {
      try {
        const cachedText = localStorage.getItem(cacheKey);
        const cached: unknown = JSON.parse(cachedText || 'null');
        if (validWorkingEvidence(cached, nextWorking.assetId)) {
          nextWorking = { ...cached };
          restored = true;
          if (cached.baseline === JSON.stringify(next.passage))
            nextWorking.revision = next.revision;
          else if (cached.revision !== next.revision)
            setError(
              'Há regiões locais não salvas e a evidência mudou. Exporte o rascunho antes de recarregar.',
            );
        } else if (!cachedText && !next.passage && next.asset?.managedState === 'ok') {
          // Prefer the last visited earlier passage, then source order. Both saved and
          // unsaved locations remain bound to this project's exact PDF fingerprint.
          for (const previous of (newPassageGuide ? next.guideCandidates : next.previousPassages) ||
            []) {
            const previousKey = `pydicate-studio:evidence-draft:v1:${JSON.stringify([projectId, sourceId, previous.id])}`;
            let donor: WorkingEvidence | null = null;
            try {
              const candidate: unknown = JSON.parse(localStorage.getItem(previousKey) || 'null');
              if (validWorkingEvidence(candidate, nextWorking.assetId)) donor = candidate;
            } catch {
              /* Preserve an unreadable donor and continue to saved evidence. */
            }
            const seed = newPassageGuide ? next.guideSeed : next.inherited;
            if (!donor && seed?.fromPassageId === previous.id)
              donor = {
                assetId: seed.assetId,
                revision: next.revision,
                regions: seed.regions,
                view: seed.view,
                ...('guide' in seed ? { guide: seed.guide } : {}),
              };
            if (donor) {
              if (!newPassageGuide && previous.ordinal === undefined) continue;
              nextWorking = newPassageGuide
                ? guideEvidence(donor, next.revision, {
                    passageId: previous.id,
                    ordinal: previous.ordinal,
                  })
                : inheritEvidence(donor, next.revision, {
                    passageId: previous.id,
                    ordinal: previous.ordinal!,
                  });
              localStorage.setItem(cacheKey, JSON.stringify(nextWorking));
              restored = true;
              break;
            }
          }
        } else if (
          cachedText &&
          cached &&
          typeof cached === 'object' &&
          'assetId' in cached &&
          cached.assetId === nextWorking.assetId
        ) {
          setError(
            'O rascunho local de regiões é inválido e foi preservado. Exporte ou restaure uma cópia válida.',
          );
        }
      } catch {
        setError(
          'O rascunho local de regiões não pôde ser lido; a evidência salva foi preservada.',
        );
      }
    }
    setWorking(nextWorking);
    setDirty(restored);
    setSelection(
      nextWorking?.regions.find((region) => region.pageIndex === nextWorking?.view.pageIndex)?.id ||
        null,
    );
    try {
      localStorage.setItem(lastVisitedKey, passageId);
    } catch {
      /* Draft persistence reports storage failures separately. */
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadedKey.current = null;
    setStatus(null);
    setWorking(null);
    setDirty(false);
    setError('');
    setSelection(null);
    setDrawing(false);
    if (!window.studio?.invoke) return;
    setBusy(true);
    let lastVisitedPassageId: string | null = null;
    try {
      lastVisitedPassageId = localStorage.getItem(lastVisitedKey);
    } catch {
      /* Source order remains available. */
    }
    window.studio
      .invoke('evidence_status', { ...params, lastVisitedPassageId })
      .then((result) => {
        if (!cancelled) acceptStatus(result as EvidenceStatus, true);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(message(failure));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // Restore this passage first; new lines use earlier geometry only as a separate visual guide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sourceId, passageId, previousPassageId, newPassageGuide]);

  useEffect(() => {
    if (!dirty || !working || loadedKey.current !== key) return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(working));
    } catch {
      setError(
        'Não foi possível recuperar estas regiões após fechar a janela. Salve ou exporte o rascunho.',
      );
    }
  }, [dirty, working, cacheKey]);

  useEffect(() => {
    if (!scroller.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(180, entry.contentRect.width - 20)),
    );
    observer.observe(scroller.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loading: ReturnType<typeof getDocument> | undefined;
    setPdf(null);
    setViewport(null);
    if (!assetId || !window.studio?.invoke || status?.asset?.managedState !== 'ok') return;
    setRendering(true);
    window.studio
      .invoke('evidence_bytes', { projectId, sourceId, passageId, assetId })
      .then(async (bytes) => {
        if (cancelled) return;
        loading = getDocument({
          data: new Uint8Array(bytes as ArrayBuffer),
          isEvalSupported: false,
          useSystemFonts: true,
        });
        const document = await loading.promise;
        if (cancelled) {
          await document.destroy();
          return;
        }
        setWorking((current) =>
          current && current.view.pageIndex >= document.numPages
            ? {
                ...current,
                view: { ...current.view, pageIndex: document.numPages - 1 },
              }
            : current,
        );
        setPdf(document);
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(`Não foi possível renderizar o PDF: ${message(failure)}`);
          setRendering(false);
        }
      });
    return () => {
      cancelled = true;
      void loading?.destroy();
    };
  }, [projectId, sourceId, assetId, status?.asset?.managedState]);

  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setRendering(true);
    setViewport(null);
    const physicalPage = Math.min(pdf.numPages, Math.max(1, view.pageIndex + 1));
    pdf
      .getPage(physicalPage)
      .then(async (page) => {
        if (cancelled || !canvas.current) return;
        const rotation = (page.rotate + view.rotation) % 360;
        const base = page.getViewport({ scale: 1, rotation });
        const next = page.getViewport({ scale: (width / base.width) * view.zoom, rotation });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const element = canvas.current;
        element.width = Math.ceil(next.width * pixelRatio);
        element.height = Math.ceil(next.height * pixelRatio);
        element.style.width = `${next.width}px`;
        element.style.height = `${next.height}px`;
        setViewport(next);
        task = page.render({
          canvas: element,
          viewport: next,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await task.promise;
        if (!cancelled) setRendering(false);
      })
      .catch((failure: unknown) => {
        if (
          !cancelled &&
          !(failure instanceof Error && failure.name === 'RenderingCancelledException')
        ) {
          setError(`Página indisponível: ${message(failure)}`);
          setRendering(false);
        }
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, view.pageIndex, view.zoom, view.rotation, width]);

  async function operation(method: string, extra: Record<string, unknown> = {}) {
    if (!window.studio?.invoke || busy) return;
    const requestKey = key;
    setBusy(true);
    setError('');
    try {
      const result = (await window.studio.invoke(method, {
        ...params,
        expectedRevision: working?.revision ?? status?.revision ?? 0,
        ...extra,
      })) as EvidenceStatus | null;
      if (activeKey.current !== requestKey || !result) return;
      if (method === 'evidence_save') localStorage.removeItem(cacheKey);
      acceptStatus(result, false);
      if (
        method === 'evidence_save' &&
        result.asset &&
        (!newPassageGuide ||
          result.passage?.regions.some((region) => region.assetId === result.asset?.id))
      )
        onEvidence?.({ version: 1, assetId: result.asset.id, passageId });
    } catch (failure) {
      if (activeKey.current === requestKey) setError(message(failure));
    } finally {
      if (activeKey.current === requestKey) setBusy(false);
    }
  }
  function changeView(patch: Partial<EvidenceView>) {
    if (!working) return;
    setWorking({ ...working, view: { ...working.view, ...patch } });
    setDirty(true);
  }
  function eventPoint(event: PointerEvent<HTMLDivElement>): [number, number] {
    const box = surface.current!.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(viewport!.width, ((event.clientX - box.left) * viewport!.width) / box.width),
      ),
      Math.max(
        0,
        Math.min(viewport!.height, ((event.clientY - box.top) * viewport!.height) / box.height),
      ),
    ];
  }
  function startGesture(event: PointerEvent<HTMLDivElement>) {
    if (disabled || busy || rendering || !viewport || !working || event.button !== 0) return;
    const target = event.target as Element;
    const regionId = target.closest('[data-region-id]')?.getAttribute('data-region-id');
    const existing = regions.find((region) => region.id === regionId);
    const start = eventPoint(event);
    if (existing) {
      setSelection(existing.id);
      gesture.current = {
        id: existing.id,
        start,
        original: viewportRect(viewport, existing.rect),
        kind: (target.getAttribute('data-handle') as Gesture['kind']) || 'move',
      };
    } else if (drawing) {
      const id = crypto.randomUUID();
      gesture.current = {
        id,
        kind: 'draw',
        start,
        original: [start[0], start[1], start[0], start[1]],
      };
      setWorking({
        ...working,
        regions: [
          ...regions,
          {
            id,
            assetId: working.assetId,
            pageIndex: view.pageIndex,
            rect: pdfRect(viewport, [start[0], start[1], start[0] + 0.1, start[1] + 0.1]),
          },
        ],
      });
      setSelection(id);
    } else return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveGesture(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || !viewport || !working) return;
    const current = eventPoint(event);
    let box: PdfRect;
    if (active.kind === 'draw') box = [active.start[0], active.start[1], current[0], current[1]];
    else if (active.kind === 'move') {
      const dx = Math.max(
        -active.original[0],
        Math.min(viewport.width - active.original[2], current[0] - active.start[0]),
      );
      const dy = Math.max(
        -active.original[1],
        Math.min(viewport.height - active.original[3], current[1] - active.start[1]),
      );
      box = [
        active.original[0] + dx,
        active.original[1] + dy,
        active.original[2] + dx,
        active.original[3] + dy,
      ];
    } else {
      box = [...active.original];
      if (active.kind.includes('w')) box[0] = current[0];
      else box[2] = current[0];
      if (active.kind.includes('n')) box[1] = current[1];
      else box[3] = current[1];
    }
    const nextRect = pdfRect(viewport, box);
    setWorking({
      ...working,
      regions: regions.map((region) =>
        region.id === active.id ? { ...region, rect: nextRect } : region,
      ),
    });
    setDirty(true);
  }
  function finishGesture() {
    const active = gesture.current;
    if (!active || !working || !viewport) return;
    setWorking({
      ...working,
      regions: regions.filter((region) => {
        if (region.id !== active.id) return true;
        const box = viewportRect(viewport, region.rect);
        return box[2] - box[0] >= 3 && box[3] - box[1] >= 3;
      }),
    });
    setDirty(true);
    setDrawing(false);
    gesture.current = null;
  }
  function exportRegions() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, ...params, working }, null, 2)], {
        type: 'application/json',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'regioes-rascunho.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const locked = Boolean(disabled || busy || !working || status?.asset?.managedState !== 'ok');

  return (
    <section className="pdf-evidence" aria-label="PDF e regiões da passagem">
      <div className="evidence-controls">
        <button
          disabled={!available || busy || disabled || dirty}
          onClick={() => void operation('evidence_attach', { replace: Boolean(assetId) })}
        >
          {assetId ? 'Vincular outro testemunho' : 'Vincular PDF à fonte'}
        </button>
        {assetId && (
          <button
            disabled={busy || disabled || dirty}
            onClick={() => void operation('evidence_relocate')}
          >
            Relocalizar mesmo PDF
          </button>
        )}
      </div>
      {!available && (
        <p className="field-hint">
          O PDF persistente está disponível no aplicativo desktop, após abrir o projeto local.
        </p>
      )}
      {status?.asset && (
        <div className="evidence-asset">
          <strong>{status.asset.name}</strong>
          <small title={status.asset.fingerprint}>
            SHA-256 {status.asset.fingerprint.slice(0, 16)}… · cópia gerenciada
          </small>
          {status.asset.originalState !== 'ok' && (
            <p role="status">
              {status.asset.originalState === 'changed'
                ? 'O arquivo original foi substituído. A cópia vinculada e suas regiões permanecem preservadas.'
                : 'O arquivo original foi movido ou está indisponível. A cópia gerenciada continua vinculada.'}
            </p>
          )}
          {status.asset.managedState !== 'ok' && (
            <p role="alert">
              A cópia gerenciada está indisponível ou mudou. Relocalize o mesmo PDF para recuperar
              as regiões.
            </p>
          )}
        </div>
      )}
      <dl className="evidence-locators">
        <div>
          <dt>Página impressa</dt>
          <dd>{printedPage || 'não informada'}</dd>
        </div>
        <div>
          <dt>Fólio</dt>
          <dd>{folio || 'não informado'}</dd>
        </div>
        <div>
          <dt>Linhas no texto</dt>
          <dd>{lineLocator || 'não informadas'}</dd>
        </div>
      </dl>
      {assetId && (
        <div className="evidence-controls evidence-view-controls">
          <label>
            Página física do PDF{' '}
            <input
              aria-label="Página física do PDF"
              type="number"
              min={1}
              max={pdf?.numPages || 100000}
              value={view.pageIndex + 1}
              disabled={locked || !pdf}
              onChange={(event) =>
                changeView({
                  pageIndex:
                    Math.min(
                      pdf?.numPages || 100000,
                      Math.max(1, Number(event.target.value) || 1),
                    ) - 1,
                })
              }
            />{' '}
            {pdf ? `/ ${pdf.numPages}` : ''}
          </label>
          <button
            disabled={locked || !pdf || view.pageIndex >= pdf.numPages - 1}
            onClick={() => changeView({ pageIndex: view.pageIndex + 1 })}
          >
            Próxima página do PDF
          </button>
          <label>
            Zoom{' '}
            <select
              aria-label="Zoom do PDF"
              disabled={locked}
              value={view.zoom}
              onChange={(event) => changeView({ zoom: Number(event.target.value) })}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((zoom) => (
                <option key={zoom} value={zoom}>
                  {Math.round(zoom * 100)}%
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={locked}
            onClick={() => changeView({ rotation: (view.rotation + 90) % 360 })}
          >
            Girar 90°
          </button>
          <span>{view.rotation}°</span>
        </div>
      )}
      <div className="evidence-scroller" ref={scroller}>
        {!assetId && (
          <p className="evidence-empty">
            Vincule a digitalização para consultar e marcar a evidência desta passagem.
          </p>
        )}
        {assetId && (
          <div
            ref={surface}
            className={`evidence-surface ${drawing ? 'is-drawing' : ''}`}
            style={viewport ? { width: viewport.width, height: viewport.height } : undefined}
            onPointerDown={startGesture}
            onPointerMove={moveGesture}
            onPointerUp={finishGesture}
            onPointerCancel={finishGesture}
          >
            <canvas ref={canvas} aria-label="Página renderizada do PDF" data-testid="pdf-canvas" />
            {viewport && (
              <svg
                aria-label="Regiões da passagem"
                className="evidence-overlay"
                width={viewport.width}
                height={viewport.height}
                viewBox={`0 0 ${viewport.width} ${viewport.height}`}
              >
                {working?.guide?.region?.pageIndex === view.pageIndex &&
                  (() => {
                    const region = working.guide.region;
                    const box = viewportRect(viewport, region.rect);
                    return (
                      <g
                        className="evidence-guide-region"
                        data-testid="pdf-guide-region"
                        data-source-passage={working.guide.fromPassageId}
                        data-pdf-rect={region.rect.join(',')}
                        role="img"
                        aria-label="Última região da passagem anterior, apenas guia visual"
                      >
                        <rect
                          x={box[0]}
                          y={box[1]}
                          width={box[2] - box[0]}
                          height={box[3] - box[1]}
                        />
                      </g>
                    );
                  })()}
                {regions
                  .filter((region) => region.pageIndex === view.pageIndex)
                  .map((region) => {
                    const box = viewportRect(viewport, region.rect);
                    return (
                      <g
                        key={region.id}
                        data-region-id={region.id}
                        data-testid="pdf-region"
                        data-pdf-rect={region.rect.join(',')}
                        className={selection === region.id ? 'is-selected' : ''}
                      >
                        <rect
                          x={box[0]}
                          y={box[1]}
                          width={box[2] - box[0]}
                          height={box[3] - box[1]}
                        />
                        {selection === region.id &&
                          (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                            <rect
                              key={corner}
                              data-handle={corner}
                              className="evidence-handle"
                              x={(corner.includes('w') ? box[0] : box[2]) - 6}
                              y={(corner.includes('n') ? box[1] : box[3]) - 6}
                              width={12}
                              height={12}
                            />
                          ))}
                      </g>
                    );
                  })}
              </svg>
            )}
          </div>
        )}
      </div>
      {(busy || rendering) && (
        <p role="status" className="field-hint">
          {busy ? 'Carregando ou salvando evidência…' : 'Renderizando página…'}
        </p>
      )}
      {assetId && (
        <>
          {working?.guide && (
            <p className="field-hint evidence-guide-hint" role="status">
              Guia da passagem anterior
              {working.guide.fromOrdinal ? ` (${working.guide.fromOrdinal})` : ''}. Marque uma nova
              região para esta passagem.
            </p>
          )}
          {working?.inheritedFrom && (
            <p className="field-hint" role="status">
              Localização herdada da passagem {working.inheritedFrom.ordinal} — ajuste se precisar.
              Salvar regiões confirma a localização desta passagem.
            </p>
          )}
          <div className="evidence-controls">
            <button
              aria-pressed={drawing}
              disabled={locked || rendering || !viewport}
              onClick={() => setDrawing(!drawing)}
            >
              Marcar região
            </button>
            <button
              disabled={locked || !selection}
              onClick={() => {
                setWorking(
                  working && {
                    ...working,
                    regions: regions.filter((region) => region.id !== selection),
                  },
                );
                setSelection(null);
                setDirty(true);
              }}
            >
              Remover região
            </button>
            <button
              disabled={locked || !dirty || rendering}
              onClick={() =>
                void operation('evidence_save', {
                  assetId,
                  regions,
                  view,
                  ...(working?.guide ? { guide: working.guide } : {}),
                })
              }
            >
              Salvar regiões
            </button>
          </div>
          {drawing && (
            <p role="status" className="field-hint">
              Arraste na página para delimitar a região. Arraste uma região para mover; use os
              quatro cantos para redimensionar.
            </p>
          )}
          <ul className="evidence-region-list">
            {regions.map((region, index) => (
              <li key={region.id}>
                <button
                  aria-pressed={selection === region.id}
                  onClick={() => {
                    setSelection(region.id);
                    changeView({ pageIndex: region.pageIndex });
                  }}
                >
                  Região {index + 1} · PDF {region.pageIndex + 1}
                </button>
              </li>
            ))}
          </ul>
          <p className="field-hint" role="status">
            {dirty
              ? 'Regiões ou visualização não salvas · rascunho local recuperável.'
              : 'Evidência salva no computador.'}{' '}
            {regions.length} região(ões).
          </p>
          {dirty && (
            <div className="evidence-controls">
              <button onClick={exportRegions}>Exportar rascunho das regiões</button>
              <button
                disabled={busy}
                onClick={() => {
                  localStorage.removeItem(cacheKey);
                  void operation('evidence_status');
                }}
              >
                Descartar regiões locais e recarregar
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </section>
  );
}
