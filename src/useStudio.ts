import { useCallback, useEffect, useRef, useState } from 'react';
import { createExampleProject, renderExample } from './domain/example';
import {
  createDraft,
  draftConflicts,
  isCurrentRender,
  readBrowserDrafts,
  updateDraft,
  writeBrowserDrafts,
} from './domain/model';
import type { Draft, DraftEnvelope, RenderResult, StudioProject } from './domain/types';

export function useStudio() {
  const [project, setProject] = useState(createExampleProject);
  const [selectedId, setSelectedId] = useState(
    () => project.passages.find((p) => p.analysis)?.id ?? project.passages[0].id,
  );
  const [envelope, setEnvelope] = useState<DraftEnvelope>({
    version: 1,
    projectId: project.id,
    drafts: {},
  });
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState('Carregando rascunhos…');
  const [error, setError] = useState('');
  const [result, setResult] = useState<RenderResult | null>(null);
  const [renderError, setRenderError] = useState('');
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState('');
  const history = useRef<Record<string, Draft[]>>({});
  const saves = useRef(Promise.resolve());
  const operation = useRef(false);
  const lastSaveError = useRef('');
  const latest = useRef({ project, envelope, ready, selectedId });
  latest.current = { project, envelope, ready, selectedId };
  const passage = project.passages.find((p) => p.id === selectedId) ?? project.passages[0];
  const draft = envelope.drafts[passage.id];
  const conflict = !!draft && draftConflicts(draft, passage);
  const editable = ready && !busy && envelope.projectId === project.id;

  function replaceEnvelope(next: DraftEnvelope) {
    latest.current.envelope = next;
    setEnvelope(next);
  }

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError('');
    history.current = {};
    const load = window.studio
      ? window.studio.loadDrafts(project.id)
      : Promise.resolve().then(() => readBrowserDrafts(project.id));
    load
      .then((saved) => {
        if (cancelled) return;
        const drafts = { ...saved?.drafts };
        for (const item of project.passages) drafts[item.id] ??= createDraft(item);
        replaceEnvelope({ version: 1, projectId: project.id, drafts });
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
    if (!editable || !draft?.analysis || conflict) {
      setResult(null);
      setPending(false);
      return;
    }
    setPending(true);
    const timer = setTimeout(() => {
      const request = {
        revisionId: draft.revisionId,
        engineFingerprint: project.engineFingerprint,
        analysis: draft.analysis!,
      };
      const render =
        project.mode === 'local' && window.studio
          ? window.studio.render(request)
          : renderExample(request);
      render
        .then((next) => {
          if (!cancelled && isCurrentRender(next, draft, project.engineFingerprint))
            setResult(next);
        })
        .catch((reason) => {
          if (!cancelled) setRenderError(String(reason.message ?? reason));
        })
        .finally(() => {
          if (!cancelled) setPending(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, project.engineFingerprint, project.mode, conflict, editable]);

  function edit(changes: Parameters<typeof updateDraft>[1]) {
    const current = latest.current;
    const selected =
      current.project.passages.find((p) => p.id === current.selectedId) ??
      current.project.passages[0];
    const previous = current.envelope.drafts[selected.id];
    if (operation.current || !current.ready || !previous || draftConflicts(previous, selected))
      return;
    history.current[selected.id] = [...(history.current[selected.id] ?? []), previous].slice(-60);
    replaceEnvelope({
      ...current.envelope,
      drafts: { ...current.envelope.drafts, [selected.id]: updateDraft(previous, changes) },
    });
    setVerification('');
  }

  function undo() {
    const current = latest.current;
    const selected =
      current.project.passages.find((p) => p.id === current.selectedId) ??
      current.project.passages[0];
    const active = current.envelope.drafts[selected.id];
    if (operation.current || !current.ready || !active || draftConflicts(active, selected)) return;
    const previous = history.current[selected.id]?.pop();
    if (!previous) return;
    replaceEnvelope({
      ...current.envelope,
      drafts: { ...current.envelope.drafts, [selected.id]: updateDraft(previous, {}) },
    });
    setVerification('');
  }

  function changeProject(next: StudioProject) {
    const sameProject = next.id === latest.current.project.id;
    if (sameProject && latest.current.ready) {
      const drafts = { ...latest.current.envelope.drafts };
      for (const item of next.passages) drafts[item.id] ??= createDraft(item);
      replaceEnvelope({ version: 1, projectId: next.id, drafts });
    } else {
      latest.current.ready = false;
      setReady(false);
      if (sameProject) setLoadAttempt((attempt) => attempt + 1);
    }
    const selected = next.passages.some((p) => p.id === latest.current.selectedId)
      ? latest.current.selectedId
      : (next.passages.find((p) => p.analysis)?.id ?? next.passages[0].id);
    latest.current.project = next;
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
    if (operation.current || !editable || !draft?.analysis || conflict) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      await persist();
      if (project.mode === 'local' && window.studio) {
        const next = await window.studio.refreshProject();
        changeProject(next);
      } else {
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

  function selectPassage(id: string) {
    if (operation.current || !project.passages.some((p) => p.id === id)) return;
    latest.current.selectedId = id;
    setSelectedId(id);
    setVerification('');
  }

  const currentResult =
    editable && !conflict && draft && isCurrentRender(result, draft, project.engineFingerprint)
      ? result
      : null;
  const passageIds = new Set(project.passages.map((item) => item.id));
  const orphanDrafts =
    envelope.projectId === project.id
      ? Object.values(envelope.drafts).filter((item) => !passageIds.has(item.passageId))
      : [];
  return {
    project,
    passage,
    draft,
    ready: editable,
    selectedId,
    setSelectedId: selectPassage,
    edit,
    undo,
    canUndo: editable && !conflict && !!history.current[passage.id]?.length,
    saveState,
    error,
    setError,
    result: currentResult,
    renderError,
    pending,
    busy,
    conflict,
    verification,
    verify,
    openProject,
    openExample,
    persist,
    envelope,
    orphanDrafts,
  };
}

export type Studio = ReturnType<typeof useStudio>;
