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
import {
  nextPassageLocators,
  projectWithPending,
  pendingInsertionContexts,
} from './domain/next-page';
import { registerProjectRecovery } from './domain/project-recovery';
import { approvalState, type ReferenceStatus } from './domain/ground-truth';

export interface SourceApplyOutcome {
  sourceApplied: boolean;
  groundTruthSaved: boolean;
  passageId?: string;
  approvalError?: string;
  draftSaveError?: string;
}

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
  const storageRevisions = useRef<Record<string, number>>({});
  const acceptanceOperations = useRef(new Map<string, string>());
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
          pendingContexts: pendingInsertionContexts(current.project, current.envelope),
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
        storageRevisions.current[project.id] = saved?.storageRevision ?? 0;
        replaceEnvelope({
          version: 1,
          projectId: project.id,
          drafts,
          storageRevision: saved?.storageRevision ?? 0,
        });
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
    const save = async () => {
      // Capture content when the edit is queued, but use only our last acknowledged
      // disk revision. A later external command must conflict, never be overwritten.
      const revision =
        storageRevisions.current[snapshot.projectId] ?? snapshot.storageRevision ?? 0;
      if (window.studio) {
        const saved = await window.studio.saveDrafts({ ...snapshot, storageRevision: revision });
        if (saved) storageRevisions.current[snapshot.projectId] = saved.storageRevision;
      } else writeBrowserDrafts(snapshot);
    };
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

  function edit(changes: Parameters<typeof updateDraft>[1], expectedRevision?: string) {
    const current = latest.current;
    const selected =
      current.project.passages.find((p) => p.id === current.selectedId) ??
      current.project.passages[0];
    const previous = current.envelope.drafts[selected.id];
    if ((operation.current && !automaticRefresh.current) || !current.ready || !previous) return;
    if (expectedRevision && previous.revisionId !== expectedRevision) return;
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
        [selected.id]: updateDraft(
          { ...previous, workflow: active.workflow, aiAcceptances: active.aiAcceptances },
          {},
        ),
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
        [current.selectedId]: updateDraft(
          { ...previous, workflow: active.workflow, aiAcceptances: active.aiAcceptances },
          {},
        ),
      },
    });
  }

  async function sourcePreview(
    isNew = false,
    metadata: Record<string, unknown> = {},
    expected?: { passageId: string; draftRevisionId: string },
  ) {
    // Acceptance updates this snapshot before React renders again. Reviewing the
    // closure's draft here would submit the old (possibly empty) expression.
    const current = latest.current;
    const selected = current.project.passages.find((item) => item.id === current.selectedId);
    const active = selected && current.envelope.drafts[selected.id];
    if (!current.ready || !selected || !active)
      throw new Error('Aguarde o carregamento do rascunho antes de revisar.');
    const revision = active.revisionId;
    const assertCurrent = () => {
      const next = latest.current;
      if (
        next.project.id !== current.project.id ||
        next.project.engineFingerprint !== current.project.engineFingerprint ||
        next.selectedId !== selected.id ||
        next.envelope.drafts[selected.id]?.revisionId !== revision ||
        (expected && (expected.passageId !== selected.id || expected.draftRevisionId !== revision))
      )
        throw new Error('A passagem ou o rascunho mudou. Abra a revisão novamente.');
    };
    assertCurrent();
    const pendingId = selected.id.startsWith('pending:') ? selected.id : undefined;
    const newPassage = isNew || !!pendingId;
    await persist();
    assertCurrent();
    const preview = await invoke<SourcePreview>(
      newPassage ? 'source_new_preview' : 'source_preview',
      {
        passageId: selected.id,
        sourceId: selected.sourceId,
        ...(pendingId ? { newPassageId: pendingId.replace(/^pending:/, 'passage:') } : {}),
        raw: active.raw,
        metadata: newPassage
          ? {
              ...active.locators,
              diplomatic: active.diplomatic,
              normalized: active.normalized,
              translation: active.translation,
              ...(active.translations ? { translations: active.translations } : {}),
              notes: active.notes,
              ...metadata,
            }
          : metadata,
      },
    );
    assertCurrent();
    return {
      ...preview,
      draftRevisionId: revision,
      ...(pendingId ? { pendingDraftId: pendingId } : {}),
    };
  }
  async function applySource(
    preview: SourcePreview,
    reviewed?: RenderResult,
  ): Promise<SourceApplyOutcome> {
    if (operation.current)
      throw new Error(
        'Aguarde a atualização ou operação atual antes de aplicar a edição revisada.',
      );
    const before = latest.current;
    const targetId = preview.targetPassageId ?? preview.passageId;
    const draftId = preview.pendingDraftId ?? targetId ?? '';
    const selected = before.project.passages.find((item) => item.id === before.selectedId);
    const active = before.envelope.drafts[draftId];
    if (preview.draftRevisionId && active?.revisionId !== preview.draftRevisionId)
      throw new Error(
        'O rascunho mudou depois desta prévia. Gere outra diferença antes de aplicar.',
      );
    const assertReviewed = () => {
      if (!reviewed) return;
      const current = latest.current;
      if (
        !before.ready ||
        !selected ||
        !active ||
        !targetId ||
        ['lexicon', 'recovery'].includes(preview.kind ?? '') ||
        ['lexicon', 'recovery'].includes(preview.reviewSummary?.kind ?? '') ||
        draftId !== before.selectedId ||
        !preview.draftRevisionId ||
        preview.draftRevisionId !== active.revisionId ||
        reviewed.revisionId !== active.revisionId ||
        reviewed.expression !== active.raw ||
        reviewed.engineFingerprint !== before.project.engineFingerprint ||
        reviewed.origin !== 'engine' ||
        reviewed.evaluationStatus === 'partial' ||
        draftConflicts(active, selected) ||
        current.project.id !== before.project.id ||
        current.project.engineFingerprint !== before.project.engineFingerprint ||
        current.selectedId !== before.selectedId ||
        current.envelope.drafts[draftId]?.revisionId !== active.revisionId
      )
        throw new Error(
          'A forma revisada não corresponde à passagem, ao rascunho ou ao motor atual. Gere outra revisão antes de salvar ground truth.',
        );
    };
    assertReviewed();
    const outcome: SourceApplyOutcome = {
      sourceApplied: false,
      groundTruthSaved: false,
      ...(targetId ? { passageId: targetId } : {}),
    };
    operation.current = true;
    setBusy(true);
    try {
      await persist();
      assertReviewed();
      const hasChanges = !!preview.diff.trim() || !!preview.files?.some((file) => file.diff.trim());
      const next =
        reviewed && !hasChanges
          ? latest.current.project
          : await invoke<StudioProject>('source_apply', {
              previewId: preview.previewId,
              sourceFingerprint: preview.sourceFingerprint,
            });
      outcome.sourceApplied = hasChanges;
      const current = latest.current;
      const savedPassage = next.passages.find((p) => p.id === targetId);
      const previousDraft = preview.pendingDraftId
        ? current.envelope.drafts[preview.pendingDraftId]
        : targetId
          ? current.envelope.drafts[targetId]
          : null;
      if (savedPassage && previousDraft) {
        const drafts = { ...current.envelope.drafts };
        if (preview.pendingDraftId) {
          delete drafts[preview.pendingDraftId];
          // Preserve the visible order when a later draft is published first.
          const ordered = current.project.passages.filter(
            (p) => p.sourceId === savedPassage.sourceId,
          );
          for (const [index, item] of ordered.entries()) {
            const pending = drafts[item.id]?.pending;
            if (!pending) continue;
            const nextId = ordered[index + 1]?.id;
            drafts[item.id] = {
              ...drafts[item.id],
              pending: {
                ...pending,
                beforePassageId:
                  nextId === preview.pendingDraftId ? savedPassage.id : (nextId ?? null),
                previousPassageId:
                  pending.previousPassageId === preview.pendingDraftId
                    ? savedPassage.id
                    : pending.previousPassageId,
              },
            };
          }
        }
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
      setVerification(
        reviewed
          ? outcome.sourceApplied
            ? 'Fonte salva. Salvando ground truth…'
            : 'Salvando ground truth…'
          : 'Edição aplicada na fonte. A referência histórica foi preservada.',
      );
      if (!reviewed) return outcome;
      // Publication may replace literals with shared names and a pending ID
      // with its stable corpus ID. Approve that returned passage under the
      // same lock, never the pre-publication React closure's selection.
      try {
        if (!savedPassage || savedPassage.id.startsWith('pending:'))
          throw new Error(
            'A passagem publicada não foi encontrada. Atualize o projeto antes de retomar a aprovação.',
          );
        await persist();
        const status = await invoke<ReferenceStatus>('reference_status', {
          passageId: savedPassage.id,
        });
        const snapshot = latest.current;
        const savedDraft = snapshot.envelope.drafts[savedPassage.id];
        if (
          snapshot.project.id !== next.id ||
          snapshot.project.engineFingerprint !== next.engineFingerprint ||
          snapshot.selectedId !== savedPassage.id ||
          !savedDraft ||
          savedDraft.revisionId !== preview.draftRevisionId
        )
          throw new Error(
            'A passagem mudou durante a publicação. Revise o estado atual antes de retomar a aprovação.',
          );
        const approval = approvalState({
          isNewPassage: false,
          status,
          changed: savedDraft.raw !== savedPassage.sourceExpression,
          conflict: draftConflicts(savedDraft, savedPassage),
          result: reviewed,
          ready: snapshot.ready,
        });
        if (!approval.ready) throw new Error(approval.reason);
        // The backend re-evaluates the published expression and checks this
        // exact human-reviewed surface, source bytes and passage identity.
        const response = await invoke<{ project: StudioProject; approval: unknown }>(
          'reference_approve',
          {
            passageId: savedPassage.id,
            sourceFingerprint: savedPassage.sourceFingerprint,
            engineFingerprint: next.engineFingerprint,
            reviewedSurface: approval.surface,
          },
        );
        outcome.groundTruthSaved = true;
        changeProject(response.project);
        const latestDraft = latest.current.envelope.drafts[savedPassage.id];
        replaceEnvelope({
          ...latest.current.envelope,
          drafts: {
            ...latest.current.envelope.drafts,
            [savedPassage.id]: {
              ...latestDraft,
              workflow: { stage: 'complete', updatedAt: new Date().toISOString() },
            },
          },
        });
        try {
          await persist();
        } catch (reason) {
          outcome.draftSaveError = reason instanceof Error ? reason.message : String(reason);
        }
        setVerification(
          outcome.draftSaveError
            ? 'Ground truth salva no corpus. Não foi possível salvar o estado de conclusão neste dispositivo: ' +
                outcome.draftSaveError
            : 'Passagem e ground truth salvas. A passagem foi marcada como concluída neste dispositivo.',
        );
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        if (outcome.groundTruthSaved) {
          outcome.draftSaveError = message;
          setVerification(
            'Ground truth salva no corpus. Não foi possível atualizar o estado local: ' + message,
          );
        } else {
          outcome.approvalError = message;
          setVerification(
            (outcome.sourceApplied ? 'A fonte foi aplicada. ' : '') +
              'A ground truth não foi salva: ' +
              message,
          );
        }
      }
      return outcome;
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

  function createPendingDraft(position?: 'before' | 'after') {
    const current = latest.current;
    if (!current.ready || (operation.current && !automaticRefresh.current)) return null;
    const identifier = 'pending:' + crypto.randomUUID();
    const lastPassage = position
      ? current.project.passages.find((p) => p.id === current.selectedId)
      : [...current.project.passages]
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
      translations: undefined,
      notes: '',
      analysis: null,
    });
    empty.locators = nextPassageLocators(lastPassage, current.envelope.drafts[lastPassage.id]);
    const siblings = current.project.passages.filter((p) => p.sourceId === lastPassage.sourceId);
    const selectedIndex = siblings.findIndex((p) => p.id === lastPassage.id);
    const beforePassageId =
      position === 'before'
        ? lastPassage.id
        : position === 'after'
          ? (siblings[selectedIndex + 1]?.id ?? null)
          : null;
    empty.pending = {
      beforePassageId,
      sourceId: lastPassage.sourceId,
      previousPassageId: position === 'before' ? siblings[selectedIndex - 1]?.id : lastPassage.id,
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
      replaceEnvelope({ ...latest.current.envelope, version: 1, projectId: next.id, drafts });
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
          engineFingerprint: current.project.engineFingerprint,
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

  async function acceptCandidate(params: {
    jobId: string;
    candidateId: string;
    candidateRevision: string;
    expectedDraftRevision: string;
    operationId?: string;
  }) {
    if (automaticRefresh.current) await automaticRefresh.current;
    if (operation.current) throw new Error('Aguarde a operação atual.');
    const current = latest.current;
    const previous = current.envelope.drafts[current.selectedId];
    if (!current.ready || !previous || previous.revisionId !== params.expectedDraftRevision)
      throw new Error('O rascunho mudou. Compare a proposta com a revisão atual.');
    operation.current = true;
    setBusy(true);
    try {
      const acceptanceKey = [
        current.project.id,
        params.jobId,
        params.candidateId,
        params.candidateRevision,
        params.expectedDraftRevision,
      ].join('|');
      let operationId = acceptanceOperations.current.get(acceptanceKey);
      if (!operationId) {
        await persist();
        operationId = params.operationId ?? crypto.randomUUID();
        acceptanceOperations.current.set(acceptanceKey, operationId);
      }
      const accept = () =>
        invoke<{
          envelope: DraftEnvelope;
          draft: Draft;
          decision: NonNullable<Draft['aiAcceptances']>[number];
        }>('analysis_accept', {
          ...params,
          projectId: current.project.id,
          operationId,
        });
      let accepted;
      try {
        accepted = await accept();
      } catch (reason) {
        const code = reason && typeof reason === 'object' && 'code' in reason ? reason.code : '';
        if (!window.studio || !['STALE_ENGINE', 'STALE_SOURCE'].includes(String(code)))
          throw reason;
        // Only reuse the explicitly chosen source. A local snapshot refresh does
        // not resubmit the AI job, and the same command ID preserves crash replay.
        const refreshed = await window.studio.refreshProject();
        if (
          refreshed.id !== current.project.id ||
          latest.current.project.id !== current.project.id ||
          latest.current.selectedId !== previous.passageId
        )
          throw new Error('O projeto ou a passagem mudou. Abra a proposta novamente.');
        changeProject(refreshed);
        if (
          latest.current.envelope.drafts[previous.passageId]?.revisionId !==
          params.expectedDraftRevision
        )
          throw new Error('O rascunho mudou durante a atualização. Abra a proposta novamente.');
        await persist();
        accepted = await accept();
      }
      if (latest.current.project.id !== current.project.id)
        throw new Error(
          'A proposta foi salva no projeto anterior. Abra-o para revisar o resultado.',
        );
      storageRevisions.current[current.project.id] = accepted.envelope.storageRevision ?? 0;
      history.current[previous.passageId] = [
        ...(history.current[previous.passageId] ?? []),
        previous,
      ].slice(-60);
      redoHistory.current[previous.passageId] = [];
      replaceEnvelope(accepted.envelope);
      acceptanceOperations.current.delete(acceptanceKey);
      const check = accepted.decision?.revalidation;
      setVerification(
        check?.status === 'failed' || check?.status === 'partial'
          ? 'Proposta aberta no editor. A avaliação atual tem falhas; corrija a árvore antes de publicar.'
          : check?.changedSinceProposal
            ? 'Proposta aberta no editor. O resultado mudou com a gramática atual; confira a forma antes de publicar.'
            : '',
      );
      setError('');
      setSaveState('Proposta aceita no rascunho');
      track('editor.operation', { action: 'ai.accept' });
      return accepted;
    } finally {
      operation.current = false;
      setBusy(false);
    }
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
    acceptCandidate,
    envelope,
    orphanDrafts,
  };
}

export type Studio = ReturnType<typeof useStudio>;
