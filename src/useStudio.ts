import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, type ParsedExpression, type SourcePreview } from './domain/authoring';
import { createExampleProject, renderExample } from './domain/example';
import {
  createDraft,
  draftConflicts,
  isCurrentRender,
  readBrowserDrafts,
  restoreDraft,
  updateDraft,
  writeBrowserDrafts,
} from './domain/model';
import type { Draft, DraftEnvelope, RenderResult, StudioProject } from './domain/types';
import { flushEdits, setUsageContext, track, trackEdit } from './domain/usage';
import { registerStructureContext, structureDrafts } from './domain/structure-drafts';
import { editCanvas, emptyCanvas } from './domain/canvas';
import { nextPassageLocators, projectWithPending } from './domain/next-page';
import { registerProjectRecovery } from './domain/project-recovery';

export function useStudio() {
  const [sourceProject, setProject] = useState(createExampleProject);
  const [selectedId, setSelectedId] = useState(
    () => sourceProject.passages.find((p) => p.analysis)?.id ?? sourceProject.passages[0].id,
  );
  const [envelope, setEnvelope] = useState<DraftEnvelope>({
    version: 1,
    projectId: sourceProject.id,
    drafts: {},
  });
  const project = useMemo(
    () => projectWithPending(sourceProject, envelope),
    [sourceProject, envelope],
  );
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState('Carregando rascunhos…');
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState<ParsedExpression | null>(null);
  const redoHistory = useRef<Record<string, Draft[]>>({});
  const booted = useRef(false);
  const restoredSelection = useRef<string | undefined>(undefined);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [renderError, setRenderError] = useState('');
  const [pending, setPending] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const evaluationCache = useRef<{
    key: string;
    parsed: ParsedExpression;
    result: RenderResult;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState('');
  const history = useRef<Record<string, Draft[]>>({});
  const saves = useRef(Promise.resolve());
  const operation = useRef(false);
  const lastSaveError = useRef('');
  const automaticRefresh = useRef<Promise<StudioProject> | null>(null);
  const [refreshRequested, setRefreshRequested] = useState<string | null>(null);
  const latest = useRef({ project, envelope, ready, selectedId });
  latest.current = { project, envelope, ready, selectedId };
  const passage = project.passages.find((p) => p.id === selectedId) ?? project.passages[0];
  const draft = envelope.drafts[passage.id];
  const conflict = !!draft && draftConflicts(draft, passage);
  const editable = ready && !busy && envelope.projectId === project.id;
  useEffect(
    () =>
      registerProjectRecovery({
        read: () => {
          const current = latest.current;
          return current.ready && current.project.mode === 'local'
            ? {
                projectId: current.project.id,
                engineFingerprint: current.project.engineFingerprint,
              }
            : undefined;
        },
        refresh: async (projectId) => {
          const next = await refreshAutomatically(projectId);
          return { projectId: next.id, engineFingerprint: next.engineFingerprint };
        },
      }),
    [],
  );
  useEffect(
    () =>
      registerStructureContext(() => {
        const current = latest.current;
        if (
          !current.ready ||
          current.project.mode !== 'local' ||
          current.envelope.projectId !== current.project.id
        )
          return;
        return {
          projectId: current.project.id,
          engineFingerprint: current.project.engineFingerprint,
          drafts: structureDrafts(current.project, current.envelope),
        };
      }),
    [],
  );
  useEffect(() => {
    setUsageContext({
      projectId: project.id,
      passageId: passage.id,
      revisionId: draft?.revisionId,
    });
  }, [project.id, passage.id, draft?.revisionId]);

  function replaceEnvelope(next: DraftEnvelope) {
    latest.current.envelope = next;
    latest.current.project = projectWithPending(latest.current.project, next);
    setEnvelope(next);
  }

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError('');
    history.current = {};
    redoHistory.current = {};
    const load = window.studio
      ? window.studio.loadDrafts(project.id)
      : Promise.resolve().then(() => readBrowserDrafts(project.id));
    load
      .then((saved) => {
        if (cancelled) return;
        const drafts = { ...saved?.drafts };
        for (const item of project.passages) drafts[item.id] = restoreDraft(drafts[item.id], item);
        replaceEnvelope({ version: 1, projectId: project.id, drafts });
        const requested = restoredSelection.current;
        if (requested && latest.current.project.passages.some((item) => item.id === requested)) {
          latest.current.selectedId = requested;
          setSelectedId(requested);
        }
        restoredSelection.current = undefined;
        setReady(true);
        setSaveState(saved ? 'Rascunhos recuperados' : 'Pronto para contribuir');
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(String(reason.message ?? reason));
          setSaveState('Falha ao recuperar rascunhos');
        }
      });
    return () => {
      cancelled = true;
    };
    // Refresh keeps current drafts; changing project or retrying a failed load reads storage.
  }, [project.id, loadAttempt]);

  const persist = useCallback(async () => {
    const current = latest.current;
    if (!current.ready || current.envelope.projectId !== current.project.id) return;
    const snapshot = current.envelope;
    const save = () =>
      window.studio
        ? window.studio.saveDrafts(snapshot)
        : Promise.resolve().then(() => writeBrowserDrafts(snapshot));
    const task = saves.current.catch(() => {}).then(save);
    saves.current = task;
    await task;
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setSaveState('Salvando…');
    // Queue each edit immediately; desktop writes are serialized and atomic.
    persist()
      .then(() => {
        if (cancelled) return;
        setSaveState('Rascunho salvo neste dispositivo');
        const previousError = lastSaveError.current;
        if (previousError) setError((current) => (current === previousError ? '' : current));
        lastSaveError.current = '';
      })
      .catch((reason) => {
        if (cancelled) return;
        setSaveState('Não foi possível salvar');
        lastSaveError.current = String(reason.message ?? reason);
        setError(lastSaveError.current);
      });
    return () => {
      cancelled = true;
    };
  }, [envelope, project.id, persist, ready]);

  useEffect(() => {
    let cancelled = false;
    setRenderError('');
    setResult(null);
    if (!editable || !draft) {
      setResult(null);
      setPending(false);
      return;
    }
    const raw = draft.raw ?? passage.sourceExpression;
    if (!raw.trim()) {
      setParsed({ raw, revisionId: draft.revisionId, root: null, diagnostics: [] });
      setPending(false);
      return;
    }
    const evaluationKey = JSON.stringify([
      project.id,
      passage.id,
      project.engineFingerprint,
      raw,
      renderAttempt,
    ]);
    const cached = evaluationCache.current;
    if (project.mode === 'local' && cached?.key === evaluationKey) {
      setParsed({ ...cached.parsed, revisionId: draft.revisionId });
      setResult({ ...cached.result, revisionId: draft.revisionId });
      setRenderError(
        cached.result.evaluationStatus === 'partial'
          ? 'Algumas etapas precisam de atenção. As partes que funcionam continuam visíveis na árvore.'
          : '',
      );
      setPending(false);
      return;
    }
    setPending(true);
    const timer = setTimeout(async () => {
      try {
        if (project.mode === 'local' && window.studio?.invoke) {
          const tree = await invoke<ParsedExpression>('parse_expression', {
            passageId: passage.id,
            sourceId: passage.sourceId,
            revisionId: draft.revisionId,
            raw,
          });
          if (cancelled) return;
          setParsed(tree);
          if (!tree.root) {
            setResult(null);
            setRenderError(
              tree.diagnostics.map((d) => (typeof d === 'string' ? d : d.message)).join('\n'),
            );
            return;
          }
          const next = await invoke<RenderResult>('evaluate_expression', {
            passageId: passage.id,
            sourceId: passage.sourceId,
            revisionId: draft.revisionId,
            raw,
            engineFingerprint: project.engineFingerprint,
          });
          if (!cancelled && isCurrentRender(next, draft, project.engineFingerprint)) {
            evaluationCache.current = {
              key: evaluationKey,
              parsed: next.tree ? { ...tree, root: next.tree } : tree,
              result: next,
            };
            setResult(next);
            if (next.tree) setParsed({ ...tree, root: next.tree });
            if (next.evaluationStatus === 'partial')
              setRenderError(
                'Algumas etapas precisam de atenção. As partes que funcionam continuam visíveis na árvore.',
              );
          }
        } else if (draft.analysis) {
          const next = await renderExample({
            revisionId: draft.revisionId,
            engineFingerprint: project.engineFingerprint,
            analysis: draft.analysis,
          });
          if (!cancelled && isCurrentRender(next, draft, project.engineFingerprint))
            setResult(next);
        } else {
          setResult(null);
          setRenderError(
            'A edição geral exige o projeto local no aplicativo desktop. Seu código continua salvo.',
          );
        }
      } catch (reason) {
        if (!cancelled) setRenderError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setPending(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    draft?.revisionId,
    draft?.raw,
    project.id,
    project.engineFingerprint,
    project.mode,
    passage.id,
    editable,
    renderAttempt,
  ]);

  useEffect(() => {
    if (!window.studio?.invoke || booted.current) return;
    booted.current = true;
    invoke<{ project: StudioProject | null; selectedPassageId?: string; error?: string }>(
      'session_restore',
    )
      .then((saved) => {
        if (saved.project) {
          restoredSelection.current = saved.selectedPassageId;
          changeProject(saved.project);
          if (
            saved.selectedPassageId &&
            saved.project.passages.some((p) => p.id === saved.selectedPassageId)
          )
            setSelectedId(saved.selectedPassageId);
        }
        if (saved.error) setError(saved.error);
      })
      .catch((reason) => setError(String(reason.message ?? reason)));
  }, []);

  useEffect(() => {
    if (project.mode === 'local' && window.studio?.invoke)
      void invoke('session_select', { projectId: project.id, passageId: selectedId }).catch(
        (reason) => setError(String(reason.message ?? reason)),
      );
  }, [project.id, project.mode, selectedId]);

  useEffect(
    () =>
      window.studio?.onEvent?.((event) => {
        if (event.type === 'source-change' && event.projectId === latest.current.project.id) {
          setRefreshRequested(event.projectId);
        }
      }),
    [],
  );
  useEffect(() => {
    if (!refreshRequested || busy || !ready) return;
    setRefreshRequested(null);
    void refreshAutomatically(refreshRequested).catch((reason) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, [refreshRequested, busy, ready]);

  function edit(changes: Parameters<typeof updateDraft>[1]) {
    const current = latest.current;
    const selected =
      current.project.passages.find((p) => p.id === current.selectedId) ??
      current.project.passages[0];
    const previous = current.envelope.drafts[selected.id];
    if ((operation.current && !automaticRefresh.current) || !current.ready || !previous) return;
    trackEdit(Object.keys(changes));
    redoHistory.current[selected.id] = [];
    history.current[selected.id] = [...(history.current[selected.id] ?? []), previous].slice(-60);
    replaceEnvelope({
      ...current.envelope,
      drafts: { ...current.envelope.drafts, [selected.id]: updateDraft(previous, changes) },
    });
    setVerification('');
  }

  function insertPiece(raw: string, expectedRevision: string) {
    const current = latest.current;
    const active = current.envelope.drafts[current.selectedId];
    const selected = current.project.passages.find((item) => item.id === current.selectedId);
    if (
      !current.ready ||
      (operation.current && !automaticRefresh.current) ||
      !active ||
      !selected ||
      active.revisionId !== expectedRevision ||
      draftConflicts(active, selected) ||
      !raw.trim()
    )
      return false;
    const canvas = active.canvas ?? emptyCanvas();
    if (!(active.raw ?? selected.sourceExpression).trim() && !canvas.fragments.length)
      edit({ raw, canvas });
    else
      edit(
        editCanvas(
          { raw: active.raw ?? selected.sourceExpression, canvas, roots: {} },
          {
            type: 'add',
            raw,
            position: {
              x: 440 + (canvas.fragments.length % 3) * 320,
              y: 120 + Math.floor(canvas.fragments.length / 3) * 220,
            },
          },
        ),
      );
    track('editor.operation', { action: 'piece.insert' });
    return true;
  }

  function undo() {
    track('editor.undo');
    const current = latest.current;
    const selected =
      current.project.passages.find((p) => p.id === current.selectedId) ??
      current.project.passages[0];
    const active = current.envelope.drafts[selected.id];
    if (
      (operation.current && !automaticRefresh.current) ||
      !current.ready ||
      !active ||
      draftConflicts(active, selected)
    )
      return;
    const previous = history.current[selected.id]?.pop();
    if (previous && active)
      redoHistory.current[selected.id] = [...(redoHistory.current[selected.id] ?? []), active];
    if (!previous) return;
    replaceEnvelope({
      ...current.envelope,
      drafts: {
        ...current.envelope.drafts,
        [selected.id]: updateDraft({ ...previous, workflow: active.workflow }, {}),
      },
    });
    setVerification('');
  }

  function redo() {
    track('editor.redo');
    const current = latest.current;
    const previous = redoHistory.current[current.selectedId]?.pop();
    const active = current.envelope.drafts[current.selectedId];
    if (
      !previous ||
      !active ||
      (operation.current && !automaticRefresh.current) ||
      !current.ready ||
      current.envelope.projectId !== current.project.id ||
      conflict
    )
      return;
    history.current[current.selectedId] = [...(history.current[current.selectedId] ?? []), active];
    replaceEnvelope({
      ...current.envelope,
      drafts: {
        ...current.envelope.drafts,
        [current.selectedId]: updateDraft({ ...previous, workflow: active.workflow }, {}),
      },
    });
  }

  async function sourcePreview(isNew = false, metadata: Record<string, unknown> = {}) {
    const revision = draft?.revisionId;
    const pendingId = passage.id.startsWith('pending:') ? passage.id : undefined;
    const newPassage = isNew || !!pendingId;
    if (pendingId) {
      const firstPending = project.passages.find(
        (item) => item.sourceId === passage.sourceId && item.id.startsWith('pending:'),
      );
      if (firstPending && firstPending.id !== pendingId)
        throw new Error(
          `Inclua primeiro a passagem ${firstPending.ordinal} na fonte. As novas passagens são acrescentadas na ordem em que foram criadas; seus rascunhos continuam salvos.`,
        );
    }
    await persist();
    const preview = await invoke<SourcePreview>(
      newPassage ? 'source_new_preview' : 'source_preview',
      {
        passageId: passage.id,
        sourceId: passage.sourceId,
        ...(pendingId ? { newPassageId: pendingId.replace(/^pending:/, 'passage:') } : {}),
        raw: draft?.raw ?? passage.sourceExpression,
        metadata:
          newPassage && draft
            ? {
                ...draft.locators,
                diplomatic: draft.diplomatic,
                normalized: draft.normalized,
                translation: draft.translation,
                notes: draft.notes,
                ...metadata,
              }
            : metadata,
      },
    );
    return {
      ...preview,
      draftRevisionId: revision,
      ...(pendingId ? { pendingDraftId: pendingId } : {}),
    };
  }
  async function applySource(preview: SourcePreview) {
    if (operation.current)
      throw new Error(
        'Aguarde a atualização ou operação atual antes de aplicar a edição revisada.',
      );
    if (
      preview.draftRevisionId &&
      latest.current.envelope.drafts[
        preview.pendingDraftId ?? preview.targetPassageId ?? preview.passageId ?? ''
      ]?.revisionId !== preview.draftRevisionId
    )
      throw new Error(
        'O rascunho mudou depois desta prévia. Gere outra diferença antes de aplicar.',
      );
    operation.current = true;
    setBusy(true);
    try {
      await persist();
      const next = await invoke<StudioProject>('source_apply', {
        previewId: preview.previewId,
        sourceFingerprint: preview.sourceFingerprint,
      });
      const current = latest.current;
      const targetId = preview.targetPassageId ?? preview.passageId;
      const savedPassage = next.passages.find((p) => p.id === targetId);
      const previousDraft = preview.pendingDraftId
        ? current.envelope.drafts[preview.pendingDraftId]
        : targetId
          ? current.envelope.drafts[targetId]
          : null;
      if (savedPassage && previousDraft) {
        const drafts = { ...current.envelope.drafts };
        if (preview.pendingDraftId) delete drafts[preview.pendingDraftId];
        drafts[savedPassage.id] = {
          ...previousDraft,
          passageId: savedPassage.id,
          sourceFingerprint: savedPassage.sourceFingerprint,
          raw: savedPassage.sourceExpression,
        };
        delete drafts[savedPassage.id].pending;
        replaceEnvelope({ ...current.envelope, drafts });
      }
      changeProject(next);
      if (savedPassage) {
        latest.current.selectedId = savedPassage.id;
        setSelectedId(savedPassage.id);
      }
      setVerification('Edição aplicada na fonte. A referência histórica foi preservada.');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  function reconcileDraft(orphanId?: string) {
    const current = latest.current;
    const selected = current.project.passages.find((p) => p.id === current.selectedId);
    const retained = current.envelope.drafts[orphanId ?? current.selectedId];
    if (operation.current || !current.ready || !selected || !retained) return;
    const active = current.envelope.drafts[selected.id];
    if (active) history.current[selected.id] = [...(history.current[selected.id] ?? []), active];
    replaceEnvelope({
      ...current.envelope,
      drafts: {
        ...current.envelope.drafts,
        [selected.id]: updateDraft(
          { ...retained, passageId: selected.id, sourceFingerprint: selected.sourceFingerprint },
          {},
        ),
      },
    });
    setVerification(
      'Rascunho associado à versão exibida. A fonte permanece disponível e só muda após revisar e aplicar a diferença.',
    );
  }

  function createPendingDraft() {
    const current = latest.current;
    if (!current.ready || (operation.current && !automaticRefresh.current)) return null;
    const identifier = 'pending:' + crypto.randomUUID();
    const lastPassage = [...current.project.passages]
      .filter((passage) => passage.sourceId === 'araujo_catecismo_1686')
      .sort((a, b) => a.ordinal - b.ordinal)
      .at(-1);
    if (!lastPassage) return null;
    const empty = createDraft({
      ...lastPassage,
      id: identifier,
      sourceExpression: '',
      sourceFingerprint: 'pending',
      diplomatic: '',
      normalized: '',
      translation: '',
      notes: '',
      analysis: null,
    });
    empty.locators = nextPassageLocators(lastPassage, current.envelope.drafts[lastPassage.id]);
    empty.pending = {
      sourceId: lastPassage.sourceId,
      previousPassageId: lastPassage.id,
      ordinal: lastPassage.ordinal + 1,
    };
    empty.canvas = { ...emptyCanvas(), layout: 'bottom-up' };
    replaceEnvelope({
      ...current.envelope,
      drafts: { ...current.envelope.drafts, [identifier]: empty },
    });
    latest.current.selectedId = identifier;
    setSelectedId(identifier);
    setParsed(null);
    setResult(null);
    setVerification('');
    track('editor.operation', { action: 'passage.create-next' }, { passageId: identifier });
    return identifier;
  }
  function editPendingDraft(identifier: string, changes: Parameters<typeof updateDraft>[1]) {
    const current = latest.current;
    const previous = current.envelope.drafts[identifier];
    if (
      !current.ready ||
      (operation.current && !automaticRefresh.current) ||
      !identifier.startsWith('pending:') ||
      !previous
    )
      return;
    replaceEnvelope({
      ...current.envelope,
      drafts: { ...current.envelope.drafts, [identifier]: updateDraft(previous, changes) },
    });
  }

  async function refreshAutomatically(expectedProjectId: string): Promise<StudioProject> {
    if (automaticRefresh.current) return automaticRefresh.current;
    if (!window.studio || latest.current.project.id !== expectedProjectId)
      throw new Error('O projeto mudou durante a busca.');
    if (operation.current)
      throw new Error('Aguarde a operação atual; a busca usará as fontes atualizadas.');
    operation.current = true;
    // Keep the editor mounted so the query, current view, and selection survive.
    const task = (async () => {
      try {
        await persist();
        const next = await window.studio!.refreshProject();
        if (latest.current.project.id !== expectedProjectId || next.id !== expectedProjectId)
          throw new Error('O projeto mudou durante a atualização.');
        changeProject(next);
        setError('');
        track(
          'editor.operation',
          { action: 'project.refresh', reason: 'external-change' },
          { outcome: 'succeeded' },
        );
        return next;
      } finally {
        operation.current = false;
        automaticRefresh.current = null;
      }
    })();
    automaticRefresh.current = task;
    return task;
  }

  async function refresh() {
    if (operation.current || !window.studio) return;
    operation.current = true;
    setBusy(true);
    try {
      await persist();
      changeProject(await window.studio.refreshProject());
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  function changeProject(next: StudioProject) {
    const sameProject = next.id === latest.current.project.id;
    if (sameProject && latest.current.ready) {
      const drafts = { ...latest.current.envelope.drafts };
      for (const item of next.passages) drafts[item.id] = restoreDraft(drafts[item.id], item);
      replaceEnvelope({ version: 1, projectId: next.id, drafts });
    } else {
      latest.current.ready = false;
      setReady(false);
      if (sameProject) setLoadAttempt((attempt) => attempt + 1);
    }
    const projected = projectWithPending(next, latest.current.envelope);
    const selected = projected.passages.some((p) => p.id === latest.current.selectedId)
      ? latest.current.selectedId
      : (next.passages.find((p) => p.analysis)?.id ?? next.passages[0].id);
    latest.current.project = projected;
    latest.current.selectedId = selected;
    setProject(next);
    setSelectedId(selected);
    setResult(null);
    setVerification('');
  }

  async function openProject() {
    if (!window.studio || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      // Finish the current project's save before the backend changes its active worker.
      await persist();
      const next = await window.studio.openProject();
      if (next) changeProject(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function openExample() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      await persist();
      changeProject(createExampleProject());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function verify() {
    if (operation.current || !editable || !draft || conflict) return;
    if (passage.id.startsWith('pending:')) {
      setRenderAttempt((attempt) => attempt + 1);
      setVerification('Avaliação do rascunho solicitada.');
      return;
    }
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      await persist();
      if (project.mode === 'local' && window.studio) {
        const checked = window.studio.invoke
          ? await invoke<{
              ok: boolean;
              blocked: number;
              sources: {
                source: string;
                records?: number;
                rendered?: number;
                extra_lines?: number;
                error?: string;
                mismatch?: { ordinal: number; expected: string; actual: string };
              }[];
            }>('reference_verify', { passageId: passage.id })
          : null;
        const next = await window.studio.refreshProject();
        changeProject(next);
        if (checked !== null)
          setVerification(
            checked.sources
              .map((item) =>
                item.error
                  ? `${item.source}: ${item.error}`
                  : item.mismatch
                    ? `Diferença na passagem ${item.mismatch.ordinal}: referência “${item.mismatch.expected}”; motor “${item.mismatch.actual}”.`
                    : `${item.records} referências conferidas; ${item.rendered} expressões avaliadas; ${item.extra_lines ?? 0} ainda sem referência.`,
              )
              .join(' '),
          );
      } else if (draft.analysis) {
        const next = await renderExample({
          revisionId: draft.revisionId,
          engineFingerprint: project.engineFingerprint,
          analysis: draft.analysis,
        });
        setResult(next);
        setVerification(
          'Comparação refeita com o exemplo avaliado. Para verificar o motor atual, abra um projeto local.',
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function approveGroundTruth(reviewedSurface: string) {
    const current = latest.current;
    const selected = current.project.passages.find((p) => p.id === current.selectedId);
    const active = selected && current.envelope.drafts[selected.id];
    if (operation.current || !current.ready || !selected || !active)
      throw new Error('Aguarde o carregamento ou a operação atual antes de salvar ground truth.');
    if (selected.id.startsWith('pending:'))
      throw new Error('Revise e acrescente a nova passagem à fonte antes de salvar ground truth.');
    if (draftConflicts(active, selected) || active.raw !== selected.sourceExpression)
      throw new Error('Aplique primeiro a edição revisada na fonte antes de salvar ground truth.');
    operation.current = true;
    setBusy(true);
    try {
      await persist();
      const response = await invoke<{ project: StudioProject; approval: unknown }>(
        'reference_approve',
        {
          passageId: selected.id,
          sourceFingerprint: selected.sourceFingerprint,
          reviewedSurface,
        },
      );
      changeProject(response.project);
      const saved = latest.current.envelope.drafts[selected.id];
      replaceEnvelope({
        ...latest.current.envelope,
        drafts: {
          ...latest.current.envelope.drafts,
          [selected.id]: {
            ...saved,
            workflow: { stage: 'complete', updatedAt: new Date().toISOString() },
          },
        },
      });
      await persist();
      setVerification(
        'Ground truth salva no corpus. A passagem foi marcada como concluída neste dispositivo.',
      );
      return response;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  function selectPassage(id: string) {
    if (
      (operation.current && !automaticRefresh.current) ||
      !latest.current.project.passages.some((p) => p.id === id)
    )
      return;
    flushEdits();
    track('navigation.passage', {}, { passageId: id });
    latest.current.selectedId = id;
    setSelectedId(id);
    setVerification('');
  }

  function setWorkflow(stage: NonNullable<Draft['workflow']>['stage']) {
    const current = latest.current;
    const previous = current.envelope.drafts[current.selectedId];
    if ((operation.current && !automaticRefresh.current) || !current.ready || !previous) return;
    track(
      'review.status',
      { from: previous.workflow?.stage ?? 'analysis', to: stage },
      { outcome: 'changed' },
    );
    replaceEnvelope({
      ...current.envelope,
      drafts: {
        ...current.envelope.drafts,
        [previous.passageId]: {
          ...previous,
          workflow: { stage, updatedAt: new Date().toISOString() },
        },
      },
    });
  }

  const currentResult =
    editable && draft && isCurrentRender(result, draft, project.engineFingerprint) ? result : null;
  const passageIds = new Set(project.passages.map((item) => item.id));
  const orphanDrafts =
    envelope.projectId === project.id
      ? Object.values(envelope.drafts).filter(
          (item) => !item.passageId.startsWith('pending:') && !passageIds.has(item.passageId),
        )
      : [];
  return {
    project,
    passage,
    draft,
    ready: editable,
    selectedId,
    setSelectedId: selectPassage,
    edit,
    insertPiece,
    setWorkflow,
    retryEvaluation: () => setRenderAttempt((attempt) => attempt + 1),
    undo,
    canUndo: editable && !conflict && !!history.current[passage.id]?.length,
    saveState,
    error,
    setError,
    result: currentResult,
    parsed: parsed?.revisionId === draft?.revisionId ? parsed : null,
    redo,
    canRedo: editable && !conflict && !!redoHistory.current[passage.id]?.length,
    sourcePreview,
    applySource,
    changeProject,
    reconcileDraft,
    refresh,
    createPendingDraft,
    editPendingDraft,
    pendingDrafts: Object.values(envelope.drafts).filter((item) =>
      item.passageId.startsWith('pending:'),
    ),
    renderError,
    pending,
    busy,
    conflict,
    verification,
    verify,
    approveGroundTruth,
    openProject,
    openExample,
    persist,
    envelope,
    orphanDrafts,
  };
}

export type Studio = ReturnType<typeof useStudio>;
