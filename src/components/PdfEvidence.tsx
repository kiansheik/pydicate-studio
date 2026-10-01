import { workspaceAutofill } from '../domain/workspace-autofill';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
} from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PageViewport,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createCachedPdfTask, type PdfLoadingTask } from '../domain/pdf-document';
import { pdfSupportOptions } from '../domain/pdf-assets';
import { EvidenceAutosaver, evidenceContent } from '../domain/evidence-autosave';
import {
  pdfRect,
  viewportRect,
  guideEvidence,
  currentEvidenceGuide,
  validWorkingEvidence,
  reconcileEvidenceCache,
  type EvidencePointer,
  type EvidencePredecessor,
  type EvidenceStatus,
  type EvidenceView,
  type PdfRect,
  type WorkingEvidence,
} from '../domain/evidence';
import '../evidence.css';

GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  preparationRef?: Ref<EvidencePreparation>;
  projectId: string;
  sourceId: string;
  passageId: string;
  previousPassageId?: string;
  insertionBeforePassageId?: string | null;
  newPassageGuide?: boolean;
  /** Current displayed order, nearest earlier passage first; never visit history. */
  visiblePreviousPassages?: EvidencePredecessor[];
  disabled?: boolean;
  initialPage?: number | null;
  printedPage?: string | null;
  folio?: string | null;
  lineLocator?: string | null;
  /** A proposed source-comment pointer; applying it remains a separate review action. */
  onEvidence?: (pointer: EvidencePointer | null) => void;
}
export interface PreparedEvidence {
  revision: number;
  passageFingerprint?: string;
  assetId?: string;
  regionIds: string[];
}
export interface EvidencePreparation {
  prepare(): Promise<PreparedEvidence>;
  focusRegion(regionId: string): void;
}
interface Gesture {
  id: string;
  kind: 'draw' | 'move' | 'nw' | 'ne' | 'sw' | 'se';
  start: [number, number];
  original: PdfRect;
}
interface PdfSource {
  projectId: string;
  sourceId: string;
  assetId: string;
  passageId: string;
  length: number;
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** PDF.js resolves an image it failed to decode with no data at all, on the
 * page or, when it caches it for the whole document, on the common objects. */
function undecodedImage(page: PDFPageProxy) {
  const missing = ([id, data]: unknown[]) => data === null && String(id).includes('img');
  return [...page.objs].some(missing) || [...page.commonObjs].some(missing);
}
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
  insertionBeforePassageId,
  newPassageGuide,
  visiblePreviousPassages,
  disabled,
  initialPage,
  printedPage,
  folio,
  lineLocator,
  onEvidence,
  preparationRef,
}: Props) {
  const key = JSON.stringify([projectId, sourceId, passageId]);
  const guideOrderKey = JSON.stringify(visiblePreviousPassages ?? null);
  const cacheKey = `pydicate-studio:evidence-draft:v1:${key}`;
  const lastVisitedKey = `pydicate-studio:evidence-last-passage:v1:${JSON.stringify([projectId, sourceId])}`;
  const activeKey = useRef(key);
  const mounted = useRef(true);
  const loadedKey = useRef<string | null>(null);
  activeKey.current = key;
  const [status, setStatus] = useState<EvidenceStatus | null>(null);
  const [working, setWorking] = useState<WorkingEvidence | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'waiting' | 'saving' | 'saved' | 'error'>('saved');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfSource, setPdfSource] = useState<PdfSource | null>(null);
  const [pdfAttempt, setPdfAttempt] = useState(0);
  const [pdfError, setPdfError] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const pdfActivity = useRef<(() => void) | null>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderedKey, setRenderedKey] = useState('');
  const [width, setWidth] = useState(500);
  const [drawing, setDrawing] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const params = {
    projectId,
    sourceId,
    passageId,
    previousPassageId,
    insertionBeforePassageId,
    newPassageGuide,
    visiblePreviousPassages,
  };
  const view = working?.view || emptyView(initialPage ?? 1);
  const regions = working?.regions || [];
  const regionPages = [...new Set(regions.map((region) => region.pageIndex + 1))].sort(
    (a, b) => a - b,
  );
  const pageRange =
    regionPages.length > 1 && regionPages.at(-1)! - regionPages[0] === regionPages.length - 1
      ? `${regionPages[0]}–${regionPages.at(-1)}`
      : regionPages.join(', ');
  const activePdfSource =
    pdfSource?.projectId === projectId && pdfSource.sourceId === sourceId ? pdfSource : null;
  const assetId = status ? status.asset?.id : activePdfSource?.assetId;
  const evidenceReady = loadedKey.current === key && working !== null;
  const renderKey = JSON.stringify([
    key,
    assetId,
    view.pageIndex,
    view.zoom,
    view.rotation,
    width,
    pdfAttempt,
  ]);
  const pagePending =
    !pdfError && Boolean(pdf && (!evidenceReady || rendering || renderedKey !== renderKey));
  const available = Boolean(window.studio?.invoke);
  const collaborative = window.studio?.runtime === 'collaborative';
  const preparing = useRef(false);
  const invalidCache = useRef(false);
  const conflictingCache = useRef(false);
  const currentEvidence = useRef({ key, working, status });
  currentEvidence.current = { key, working, status };
  const evidenceCallback = useRef(onEvidence);
  evidenceCallback.current = onEvidence;
  const autosaver = useRef<EvidenceAutosaver | null>(null);
  if (!autosaver.current)
    autosaver.current = new EvidenceAutosaver(
      async (input) => (await window.studio!.invoke!('evidence_save', input)) as EvidenceStatus,
      (event) => {
        let cacheFailed = false;
        try {
          const savedKey = `pydicate-studio:evidence-draft:v1:${event.key}`;
          const cached: unknown = JSON.parse(localStorage.getItem(savedKey) ?? 'null');
          if (
            event.status &&
            validWorkingEvidence(cached, event.working.assetId) &&
            evidenceContent(cached) === evidenceContent(event.working)
          )
            localStorage.setItem(savedKey, JSON.stringify(event.working));
        } catch {
          cacheFailed = true;
          if (activeKey.current === event.key)
            setError('Não foi possível preservar o rascunho local das regiões. Exporte uma cópia.');
        }
        if (!mounted.current || activeKey.current !== event.key || loadedKey.current !== event.key)
          return;
        setSaveState(event.state);
        if (event.state === 'saved' && !cacheFailed) setError('');
        if (event.error) setError(`Não foi possível salvar as regiões: ${message(event.error)}`);
        if (event.status) {
          currentEvidence.current = {
            key: event.key,
            working: event.working,
            status: event.status,
          };
          setWorking(event.working);
          setStatus(event.status);
          setDirty(event.state !== 'saved');
          const own = event.status.passage?.regions.filter(
            (region) => region.assetId === event.status?.asset?.id,
          );
          evidenceCallback.current?.(
            event.status.asset && own?.length
              ? { version: 1, assetId: event.status.asset.id, passageId: JSON.parse(event.key)[2] }
              : null,
          );
        }
      },
    );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useImperativeHandle(preparationRef, () => ({
    async prepare() {
      const live = currentEvidence.current;
      const currentStatus = live.key === key ? live.status : null;
      const currentWorking = live.key === key ? live.working : null;
      if (!window.studio?.invoke || loadedKey.current !== key || !currentStatus)
        throw new Error('Aguarde o carregamento da evidência antes de analisar.');
      if (busy || preparing.current || gesture.current)
        throw new Error('Conclua a edição ou salvamento da região antes de analisar.');
      if (invalidCache.current)
        throw new Error(
          'As regiões locais precisam ser recuperadas antes de analisar. Exporte ou restaure o rascunho de regiões.',
        );
      if (conflictingCache.current)
        throw new Error(
          'A evidência mudou em outra edição. Exporte ou confira o rascunho local antes de analisar.',
        );
      if (!currentStatus.asset)
        return {
          revision: currentStatus.revision,
          passageFingerprint: currentStatus.passageFingerprint,
          regionIds: [],
        };
      if (dirty && currentStatus.asset.managedState !== 'ok')
        throw new Error('O PDF vinculado está indisponível. Restaure o arquivo antes de analisar.');
      if (!currentWorking) throw new Error('A evidência ainda não está pronta.');
      const requestKey = key;
      preparing.current = true;
      setBusy(true);
      try {
        if (dirty) autosaver.current!.update(key, params, currentWorking);
        const next = (await autosaver.current!.flush(key)) ?? currentStatus;
        if (activeKey.current !== requestKey)
          throw new Error('A passagem mudou durante o salvamento. Volte a ela para analisar.');
        const ownRegions =
          next.passage?.regions.filter((region) => region.assetId === next.asset?.id) ?? [];
        return {
          revision: next.revision,
          passageFingerprint: next.passageFingerprint,
          assetId: next.asset?.id,
          regionIds: ownRegions.map((region) => region.id),
        };
      } catch (failure) {
        if (activeKey.current === requestKey) setError(message(failure));
        throw failure;
      } finally {
        preparing.current = false;
        if (activeKey.current === requestKey) setBusy(false);
      }
    },
    focusRegion(regionId) {
      const region = working?.regions.find((item) => item.id === regionId);
      if (region) {
        setSelection(region.id);
        setFocusRequest((value) => value + 1);
        changeView({ pageIndex: region.pageIndex });
      }
    },
  }));

  function acceptStatus(next: EvidenceStatus, restoreDraft: boolean) {
    if (activeKey.current !== key || next.projectId !== projectId || next.sourceId !== sourceId)
      return;
    autosaver.current!.discard(key);
    invalidCache.current = false;
    conflictingCache.current = false;
    loadedKey.current = key;
    setStatus(next);
    // Passage metadata can refresh without closing or downloading its source PDF.
    setPdfSource((current) => {
      if (!next.asset || next.asset.managedState !== 'ok') return null;
      if (
        current?.projectId === projectId &&
        current.sourceId === sourceId &&
        current.assetId === next.asset.id
      )
        return current;
      return { projectId, sourceId, passageId, assetId: next.asset.id, length: next.asset.bytes };
    });
    const boundRegions =
      next.passage?.regions.filter((region) => region.assetId === next.asset?.id) || [];
    // Saved crops carry their portable source pointer across reloads. Changing
    // the selected PDF clears that pointer until this passage has its own saved
    // regions; predecessor guides and cached rectangles cannot supply it.
    onEvidence?.(
      next.asset && boundRegions.length ? { version: 1, assetId: next.asset.id, passageId } : null,
    );
    const savedView =
      next.passage && (!next.passage.viewAssetId || next.passage.viewAssetId === next.asset?.id)
        ? next.passage.view
        : emptyView(initialPage ?? 1);
    let nextWorking: WorkingEvidence | null = next.asset
      ? {
          assetId: next.asset.id,
          revision: next.revision,
          passageFingerprint: next.passageFingerprint,
          regions: boundRegions,
          view: savedView,
          baseline: JSON.stringify(next.passage),
          ...(next.passage?.guide?.assetId === next.asset.id ? { guide: next.passage.guide } : {}),
        }
      : null;
    let restored = false;
    let seededGuide = false;
    let restoredGuideOnly = false;
    if (restoreDraft && nextWorking) {
      try {
        const cachedText = localStorage.getItem(cacheKey);
        const cached: unknown = JSON.parse(cachedText || 'null');
        const validCache = validWorkingEvidence(cached, nextWorking.assetId);
        const untouchedCache =
          validCache &&
          !cached.regions.length &&
          !cached.guide &&
          cached.baseline === JSON.stringify(next.passage) &&
          JSON.stringify(cached.view) === JSON.stringify(savedView);
        if (validCache) {
          restoredGuideOnly =
            !next.passage &&
            !cached.regions.length &&
            (cached.guideOnly === true || (cached.guideOnly === undefined && !!cached.guide));
          nextWorking = reconcileEvidenceCache(
            cached,
            nextWorking,
            next.guideSources !== undefined,
          );
          restored = true;
          if (nextWorking.baseline === JSON.stringify(next.passage)) {
            nextWorking.revision = next.revision;
            nextWorking.passageFingerprint = next.passageFingerprint;
          } else if (nextWorking.baseline !== undefined || nextWorking.revision !== next.revision) {
            conflictingCache.current = true;
            setError(
              'Há regiões locais não salvas e a evidência mudou. Exporte o rascunho antes de recarregar.',
            );
          }
        }
        if (
          next.guideSources === undefined &&
          (!cachedText || untouchedCache) &&
          !next.passage &&
          next.asset?.managedState === 'ok'
        ) {
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
              // A previous passage supplies a location guide, never this
              // passage's source evidence, including when it spans pages.
              nextWorking = {
                ...guideEvidence(donor, next.revision, {
                  passageId: previous.id,
                  ordinal: previous.ordinal,
                }),
                passageFingerprint: next.passageFingerprint,
              };
              localStorage.setItem(cacheKey, JSON.stringify(nextWorking));
              restored = true;
              seededGuide = true;
              break;
            }
          }
        } else if (
          cachedText &&
          !validCache &&
          cached &&
          typeof cached === 'object' &&
          'assetId' in cached &&
          cached.assetId === nextWorking.assetId
        ) {
          invalidCache.current = true;
          setError(
            'O rascunho local de regiões é inválido e foi preservado. Exporte ou restaure uma cópia válida.',
          );
        }
      } catch {
        invalidCache.current = true;
        setError(
          'O rascunho local de regiões não pôde ser lido; a evidência salva foi preservada.',
        );
      }
    }
    if (nextWorking && next.guideSources !== undefined && next.asset?.managedState === 'ok') {
      const resolved = currentEvidenceGuide(nextWorking.assetId, next.guideSources, (id) => {
        try {
          return JSON.parse(
            localStorage.getItem(
              `pydicate-studio:evidence-draft:v1:${JSON.stringify([projectId, sourceId, id])}`,
            ) || 'null',
          );
        } catch {
          return null;
        }
      });
      // Guides are derived on every visit/order change. They do not alter owned
      // crops or a reader's saved viewport, and never trigger a write by themselves.
      const guideOnly =
        !next.passage && !nextWorking.regions.length && (!restored || restoredGuideOnly);
      nextWorking = {
        ...nextWorking,
        guide: resolved.guide,
        guideOnly,
        ...(!restored && !next.passage && resolved.view ? { view: { ...resolved.view } } : {}),
      };
      seededGuide = guideOnly;
      if (!invalidCache.current && !conflictingCache.current) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(nextWorking));
        } catch {
          /* The existing status/error path preserves saved evidence. */
        }
      }
    }
    const initialRegion = restoreDraft
      ? (nextWorking?.regions[0] ?? (!restored ? nextWorking?.guide?.region : undefined))
      : undefined;
    if (initialRegion && nextWorking)
      nextWorking = {
        ...nextWorking,
        view: { ...nextWorking.view, pageIndex: initialRegion.pageIndex },
      };
    const needsSave = Boolean(
      restored &&
      !seededGuide &&
      !nextWorking?.inheritedFrom &&
      nextWorking &&
      (JSON.stringify(nextWorking.regions) !== JSON.stringify(boundRegions) ||
        JSON.stringify(nextWorking.view) !== JSON.stringify(savedView)),
    );
    currentEvidence.current = { key, working: nextWorking, status: next };
    setWorking(nextWorking);
    setDirty(needsSave);
    setSaveState(needsSave ? (conflictingCache.current ? 'error' : 'waiting') : 'saved');
    if (needsSave && nextWorking && !invalidCache.current && !conflictingCache.current && !disabled)
      autosaver.current!.update(key, params, nextWorking);
    setSelection(
      initialRegion?.id ||
        nextWorking?.regions.find((region) => region.pageIndex === nextWorking?.view.pageIndex)
          ?.id ||
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
    setSaveState('saved');
    setError('');
    setSelection(null);
    setDrawing(false);
    gesture.current = null;
    if (!window.studio?.invoke) return;
    setBusy(true);
    let lastVisitedPassageId: string | null = null;
    try {
      lastVisitedPassageId = localStorage.getItem(lastVisitedKey);
    } catch {
      /* Source order remains available. */
    }
    void autosaver
      .current!.flush(key)
      .catch(() => {})
      .then(() => window.studio!.invoke!('evidence_status', { ...params, lastVisitedPassageId }))
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
      // Finish the outgoing passage under its own captured identity. A late
      // acknowledgement may update its cache, never the newly selected UI.
      void autosaver.current!.flush(key).catch(() => {});
    };
    // Restore this passage first; new lines use earlier geometry only as a separate visual guide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sourceId, passageId, previousPassageId, newPassageGuide, guideOrderKey]);

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
    let failed = false;
    let documentLoaded = false;
    let loading: PdfLoadingTask | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setPdf(null);
    setViewport(null);
    setRendering(false);
    setLoadingPdf(false);
    setPdfError('');
    setReceivedBytes(0);
    if (!activePdfSource || !window.studio?.invoke) return;
    const { length, ...request } = activePdfSource;
    const bridge = window.studio;
    const fail = (failure: unknown) => {
      if (cancelled || failed) return;
      failed = true;
      clearTimeout(timer);
      setPdfError(`Não foi possível carregar o PDF: ${message(failure)}`);
      setLoadingPdf(false);
      setRendering(false);
      void loading?.destroy().catch(() => {});
    };
    const progress = () => {
      clearTimeout(timer);
      if (!documentLoaded)
        timer = setTimeout(
          () =>
            fail(
              new Error(
                'A transferência ficou sem progresso. Verifique sua conexão e tente novamente.',
              ),
            ),
          45000,
        );
    };
    setLoadingPdf(true);
    progress();
    void (async () => {
      const cacheScope = bridge.evidenceCacheScope?.();
      if (bridge.evidenceUrl && cacheScope) {
        loading = createCachedPdfTask({
          ...request,
          length,
          url: bridge.evidenceUrl(request),
          cacheScope,
          onError: fail,
        });
      } else {
        const source = bridge.evidenceUrl
          ? {
              url: bridge.evidenceUrl(request),
              withCredentials: true,
              disableStream: true,
              disableAutoFetch: true,
              rangeChunkSize: 64 * 1024,
            }
          : {
              data: new Uint8Array(
                (await bridge.invoke!('evidence_bytes', { ...request })) as ArrayBuffer,
              ),
            };
        if (cancelled || failed) return;
        loading = getDocument({
          ...pdfSupportOptions(),
          ...source,
          isEvalSupported: false,
          useSystemFonts: true,
        });
      }
      loading.onProgress = ({ loaded }: { loaded: number }) => {
        if (cancelled || failed) return;
        setReceivedBytes(loaded);
        progress();
        pdfActivity.current?.();
      };
      const document = await loading.promise;
      if (cancelled || failed) {
        await document.destroy();
        return;
      }
      documentLoaded = true;
      clearTimeout(timer);
      setWorking((current) =>
        current && current.view.pageIndex >= document.numPages
          ? { ...current, view: { ...current.view, pageIndex: document.numPages - 1 } }
          : current,
      );
      setLoadingPdf(false);
      setPdf(document);
    })().catch(fail);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      void loading?.destroy().catch(() => {});
    };
  }, [activePdfSource, pdfAttempt]);

  useEffect(() => {
    if (!pdf || !canvas.current || !evidenceReady) return;
    let cancelled = false;
    let failed = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setRendering(true);
    setPdfError('');
    setViewport(null);
    let timer: ReturnType<typeof setTimeout>;
    const activity = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (cancelled) return;
        failed = true;
        task?.cancel();
        setRendering(false);
        setPdfError('A página não terminou de carregar. Verifique sua conexão e tente novamente.');
        void pdf.destroy().catch(() => {});
      }, 60000);
    };
    pdfActivity.current = activity;
    activity();
    const physicalPage = Math.min(pdf.numPages, Math.max(1, view.pageIndex + 1));
    pdf
      .getPage(physicalPage)
      .then(async (page) => {
        if (cancelled || failed || !canvas.current) return;
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
        if (!cancelled && !failed) {
          // A scan is one large image per page. PDF.js reports a picture it
          // could not decode by resolving the object with no data, skips it and
          // still completes the render, which would leave a blank page and no
          // sign that anything went wrong.
          if (undecodedImage(page))
            setPdfError(
              'Esta página do PDF tem uma imagem que não pôde ser decodificada e por isso aparece em branco. Tente carregar novamente ou vincule outra digitalização.',
            );
          setRenderedKey(renderKey);
          setRendering(false);
        }
      })
      .catch((failure: unknown) => {
        if (
          !cancelled &&
          !failed &&
          !(failure instanceof Error && failure.name === 'RenderingCancelledException')
        ) {
          setPdfError(`Página indisponível: ${message(failure)}`);
          setRendering(false);
        }
      })
      .finally(() => {
        clearTimeout(timer);
        if (pdfActivity.current === activity) pdfActivity.current = null;
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (pdfActivity.current === activity) pdfActivity.current = null;
      task?.cancel();
    };
  }, [pdf, view.pageIndex, view.zoom, view.rotation, width, evidenceReady, key, renderKey]);

  useEffect(() => {
    if (
      pagePending ||
      drawing ||
      gesture.current ||
      !viewport ||
      !scroller.current ||
      !surface.current
    )
      return;
    const region = regions.find((item) => item.id === selection) ?? working?.guide?.region;
    if (!region || region.pageIndex !== view.pageIndex) return;
    const box = viewportRect(viewport, region.rect);
    const container = scroller.current;
    const page = surface.current;
    const outer = container.getBoundingClientRect();
    const inner = page.getBoundingClientRect();
    container.scrollTo({
      left:
        container.scrollLeft +
        inner.left -
        outer.left +
        (box[0] + box[2]) / 2 -
        container.clientWidth / 2,
      top:
        container.scrollTop +
        inner.top -
        outer.top +
        (box[1] + box[3]) / 2 -
        container.clientHeight / 2,
      behavior: 'instant',
    });
  }, [selection, viewport, pagePending, key, focusRequest]);

  async function operation(method: string, extra: Record<string, unknown> = {}) {
    if (!window.studio?.invoke || busy) return;
    const requestKey = key;
    setBusy(true);
    setError('');
    try {
      const flushed =
        method !== 'evidence_status' ? await autosaver.current!.flush(key) : undefined;
      if (activeKey.current !== requestKey) return;
      const live = currentEvidence.current;
      const result = (await window.studio.invoke(method, {
        ...params,
        expectedRevision: flushed?.revision ?? live.working?.revision ?? live.status?.revision ?? 0,
        ...extra,
      })) as EvidenceStatus | null;
      if (activeKey.current !== requestKey || !result) return;
      acceptStatus(result, false);
    } catch (failure) {
      if (activeKey.current === requestKey) setError(message(failure));
    } finally {
      if (activeKey.current === requestKey) setBusy(false);
    }
  }
  function editWorking(next: WorkingEvidence, schedule = true) {
    const previous = currentEvidence.current.key === key ? currentEvidence.current.working : null;
    if (!previous || loadedKey.current !== key || next.assetId !== previous.assetId) return;
    // A network acknowledgement can precede React's next render; keep its
    // concurrency baseline while applying the user's geometry/view change.
    next = {
      ...next,
      guideOnly: false,
      revision: previous.revision,
      passageFingerprint: previous.passageFingerprint,
      baseline: previous.baseline,
    };
    if (evidenceContent(previous) === evidenceContent(next) && !gesture.current && !dirty) return;
    currentEvidence.current = { ...currentEvidence.current, working: next };
    setWorking(next);
    setDirty(true);
    // Persist before React renders, including intermediate drag coordinates.
    let cached = true;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(next));
    } catch {
      cached = false;
      setError('Não foi possível preservar o rascunho local das regiões. Exporte uma cópia.');
    }
    if (invalidCache.current || conflictingCache.current || disabled) return;
    if (cached) setError('');
    autosaver.current!.update(key, params, next, schedule);
  }
  function changeView(patch: Partial<EvidenceView>) {
    if (!working) return;
    gesture.current = null;
    editWorking({ ...working, view: { ...working.view, ...patch } });
  }
  function reorderRegion(index: number, offset: number) {
    if (!working || index + offset < 0 || index + offset >= regions.length) return;
    const reordered = [...regions];
    [reordered[index], reordered[index + offset]] = [reordered[index + offset], reordered[index]];
    editWorking({ ...working, regions: reordered });
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
    if (disabled || busy || pagePending || pdfError || !viewport || !working || event.button !== 0)
      return;
    const target = event.target as Element;
    const regionId = target.closest('[data-region-id]')?.getAttribute('data-region-id');
    const existing = regions.find((region) => region.id === regionId);
    const start = eventPoint(event);
    if (existing || drawing) autosaver.current!.pause(key);
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
      editWorking(
        {
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
        },
        false,
      );
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
    editWorking(
      {
        ...working,
        regions: regions.map((region) =>
          region.id === active.id ? { ...region, rect: nextRect } : region,
        ),
      },
      false,
    );
  }
  function finishGesture() {
    const active = gesture.current;
    if (!active || !working || !viewport) return;
    gesture.current = null;
    editWorking({
      ...working,
      regions: regions.filter((region) => {
        if (region.id !== active.id) return true;
        const box = viewportRect(viewport, region.rect);
        return box[2] - box[0] >= 3 && box[3] - box[1] >= 3;
      }),
    });
    setDrawing(false);
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
  const locked = Boolean(
    disabled || busy || !evidenceReady || status?.asset?.managedState !== 'ok',
  );

  return (
    <section className="pdf-evidence" aria-label="PDF e regiões da passagem">
      <div className="evidence-controls">
        {(!assetId || window.studio?.capabilities?.sourceReview !== false) && (
          <button
            disabled={!available || busy || disabled || dirty}
            onClick={() => void operation('evidence_attach', { replace: Boolean(assetId) })}
          >
            {assetId ? 'Vincular outro testemunho' : 'Vincular PDF à fonte'}
          </button>
        )}
        {assetId && !collaborative && (
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
          {!collaborative && status.asset.originalState !== 'ok' && (
            <p role="status">
              {status.asset.originalState === 'changed'
                ? 'O arquivo original foi substituído. A cópia vinculada e suas regiões permanecem preservadas.'
                : 'O arquivo original foi movido ou está indisponível. A cópia gerenciada continua vinculada.'}
            </p>
          )}
          {status.asset.managedState !== 'ok' && (
            <p role="alert">
              {collaborative
                ? 'O PDF está indisponível. Peça à administração para recuperar a cópia do servidor.'
                : 'A cópia gerenciada está indisponível ou mudou. Relocalize o mesmo PDF para recuperar as regiões.'}
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
              {...workspaceAutofill}
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
              {...workspaceAutofill}
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
            <canvas
              ref={canvas}
              aria-label="Página renderizada do PDF"
              data-testid="pdf-canvas"
              aria-busy={busy || loadingPdf || pagePending}
              data-pdf-page={renderedKey === renderKey ? view.pageIndex + 1 : undefined}
            />
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
      {(busy || loadingPdf || pagePending) && (
        <p role="status" className="field-hint">
          {busy
            ? 'Carregando ou salvando evidência…'
            : loadingPdf
              ? 'Carregando PDF…'
              : 'Renderizando página…'}
          {!busy &&
            collaborative &&
            receivedBytes > 0 &&
            ` ${(receivedBytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB recebidos.`}
        </p>
      )}
      {pdfError && (
        <div className="evidence-controls">
          <p role="alert">{pdfError}</p>
          <button onClick={() => setPdfAttempt((attempt) => attempt + 1)}>
            Tentar carregar PDF novamente
          </button>
        </div>
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
              Ao editar, a localização será salva para esta passagem.
            </p>
          )}
          <div className="evidence-controls">
            <button
              aria-pressed={drawing}
              disabled={locked || pagePending || Boolean(pdfError) || !viewport}
              onClick={() => setDrawing(!drawing)}
            >
              Marcar região
            </button>
            <button
              disabled={
                locked || rendering || !pdf || !regions.length || view.pageIndex >= pdf.numPages - 1
              }
              onClick={() => {
                changeView({ pageIndex: view.pageIndex + 1 });
                setSelection(null);
                setDrawing(true);
              }}
            >
              Adicionar região na próxima página
            </button>
            <button
              disabled={locked || !selection}
              onClick={() => {
                if (working)
                  editWorking({
                    ...working,
                    regions: regions.filter((region) => region.id !== selection),
                  });
                setSelection(null);
              }}
            >
              Remover região
            </button>
          </div>
          {drawing && (
            <p role="status" className="field-hint">
              Arraste na página para delimitar a região. Arraste uma região para mover; use os
              quatro cantos para redimensionar.
            </p>
          )}
          {regions.length > 0 && (
            <p className="field-hint" aria-label="Páginas abrangidas pela passagem">
              Páginas da passagem no PDF: {pageRange}. Recortes na ordem de leitura abaixo. Para
              outro recorte nesta página ou em qualquer outra, use Marcar região.
            </p>
          )}
          <ol className="evidence-region-list" aria-label="Recortes em ordem de leitura">
            {regions.map((region, index) => (
              <li key={region.id}>
                <button
                  disabled={locked || rendering}
                  aria-pressed={selection === region.id}
                  onClick={() => {
                    setSelection(region.id);
                    setFocusRequest((value) => value + 1);
                    changeView({ pageIndex: region.pageIndex });
                  }}
                >
                  Região {index + 1} · PDF {region.pageIndex + 1}
                </button>
                <button
                  aria-label={`Mover região ${index + 1} para antes`}
                  disabled={locked || rendering || index === 0}
                  onClick={() => reorderRegion(index, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`Mover região ${index + 1} para depois`}
                  disabled={locked || rendering || index === regions.length - 1}
                  onClick={() => reorderRegion(index, 1)}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
          <p className="field-hint" role="status">
            {saveState === 'saving'
              ? 'Salvando regiões…'
              : saveState === 'error'
                ? 'Regiões não salvas · rascunho local preservado.'
                : dirty
                  ? 'Alterações serão salvas automaticamente…'
                  : collaborative
                    ? 'Evidência salva no servidor.'
                    : 'Evidência salva no computador.'}{' '}
            {regions.length} região(ões).
          </p>
          {dirty && (
            <div className="evidence-controls">
              {saveState === 'error' && !conflictingCache.current && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    void autosaver.current!.flush(key).catch(() => {});
                  }}
                >
                  Tentar novamente
                </button>
              )}
              <button onClick={exportRegions}>Exportar rascunho das regiões</button>
              <button
                disabled={busy || saveState === 'saving'}
                onClick={() => {
                  if (!autosaver.current!.discard(key)) return;
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
