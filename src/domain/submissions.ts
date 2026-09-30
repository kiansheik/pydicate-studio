import { useEffect, useState } from 'react';

export interface SubmissionSummary {
  id: string;
  projectId: string;
  passageId: string;
  sourceId?: string;
  sourceTitle?: string;
  ordinal?: string | number;
  revisionId: string;
  draftRevisionId: number | string;
  submittedAt: number;
  author: string;
  status: 'submitted' | 'ready' | 'changes_requested' | 'imported' | 'merged';
}
export const submissionLabels = {
  submitted: 'Aguardando revisão',
  ready: 'Pronta para incorporar',
  changes_requested: 'Correção solicitada',
  imported: 'Incorporada',
  merged: 'Publicada',
};
export const submissionKey = (id: string) => id.replace(/^pending:/, 'passage:');
export function latestSubmissions(rows: SubmissionSummary[]) {
  const result: Record<string, SubmissionSummary> = {};
  for (const row of rows) {
    const key = submissionKey(row.passageId);
    if (!result[key] || Number(row.draftRevisionId) > Number(result[key].draftRevisionId))
      result[key] = row;
  }
  return result;
}
export function useSubmissions(projectId: string) {
  const [state, setState] = useState<{
    projectId: string;
    rows: SubmissionSummary[];
    error: string;
  }>({ projectId, rows: [], error: '' });
  useEffect(() => {
    const bridge = window.studio;
    if (!bridge?.listSubmissions) return;
    let alive = true,
      running = false,
      again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        const rows = await bridge!.listSubmissions!(projectId);
        if (alive) setState({ projectId, rows, error: '' });
      } catch {
        if (alive)
          setState((current) => ({
            ...current,
            error: 'Não foi possível atualizar os envios para revisão.',
          }));
      } finally {
        running = false;
        if (alive && again) {
          again = false;
          timer = setTimeout(() => void refresh(), 250);
        }
      }
    }
    const unsubscribe = bridge.onEvent?.((event) => {
      if (['submissions-change', 'resync-required', 'connected'].includes(event.type))
        void refresh();
    });
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [projectId]);
  return {
    submissions: latestSubmissions(state.projectId === projectId ? state.rows : []),
    error: state.error,
  };
}

export interface SubmissionReview {
  token: string;
  id: string;
  passageId: string;
  sourceId: string;
  draft: import('./types').Draft;
  evaluation: import('./types').RenderResult;
  preview: import('./authoring').SourcePreview;
  evidence: import('./evidence').EvidenceStatus;
}
export interface SubmissionPublication {
  id: string;
  passageId: string;
  sourceApplied: boolean;
  approved: boolean;
  error?: string;
  project: import('./types').StudioProject;
  envelope: import('./types').DraftEnvelope;
}
