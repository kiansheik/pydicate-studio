import { translationChange } from '../domain/translations';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushLexicalNotes } from '../domain/lexical-note-sync';
import { analysisNoteSnapshot, submissionOperation } from '../domain/analysis-submission';
import type { LexicalNote } from '../domain/passage-lexicon';
import { invoke, flattenNodes, type AuthorNode } from '../domain/authoring';
import { aiSelection, type AIStatus } from '../domain/ai';
import {
  analysisError,
  analysisActivity,
  analysisLabels,
  analysisProgress,
  analysisStreamText,
  analysisTasks,
  canAcceptCandidate,
  candidateTranslation,
  comparisonLabel,
  citationDetails,
  emptyAnalysis,
  preparedAnalysisInput,
  type AnalysisCandidate,
  type AnalysisConversation,
  type AnalysisEvidence,
  type AnalysisJob,
  type AnalysisListing,
  type AnalysisTask,
  type AnalysisQuestion,
} from '../domain/analysis';
import type { EvidencePointer, EvidenceStatus } from '../domain/evidence';
import type { Studio } from '../useStudio';
import type { WorkspaceLayoutController } from './WorkspaceLayout';
import { SourcePane } from './SourcePane';
import { AssistantPanel } from './AssistantPanel';
import { PydicateTree } from './RuntimeTree';
import type { CanvasEdit, CanvasState } from '../domain/canvas';
import type { EvidencePreparation } from './PdfEvidence';
import '../analysis-support.css';

type AnalysisDetail = {
  job: AnalysisJob;
  conversation: AnalysisConversation;
  candidates: AnalysisCandidate[];
};
function rememberConversation(
  cache: Map<string, AnalysisConversation>,
  conversation: AnalysisConversation,
) {
  const previous = cache.get(conversation.id);
  if (!previous || previous.revision <= conversation.revision)
    cache.set(conversation.id, conversation);
  return cache.get(conversation.id)!;
}
function readableText(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, index) =>
      part.startsWith('**') ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith('`') ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}
function mergeAnalysisDetails(
  listing: AnalysisListing,
  details: Map<string, AnalysisDetail>,
  conversations: Map<string, AnalysisConversation>,
): AnalysisListing {
  const currentDetails = [...details.values()].filter((detail) =>
    listing.jobs.some((job) => job.id === detail.job.id && job.updatedAt === detail.job.updatedAt),
  );
  return {
    ...listing,
    jobs: listing.jobs
      .map((job) => currentDetails.find((item) => item.job.id === job.id)?.job ?? job)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    conversations: listing.conversations.map((conversation) => {
      const cached = conversations.get(conversation.id);
      return cached && cached.revision >= conversation.revision
        ? cached
        : { ...conversation, turns: cached?.turns ?? conversation.turns };
    }),
    candidates: [
      ...listing.candidates.filter(
        (candidate) => !currentDetails.some((detail) => detail.job.id === candidate.jobId),
      ),
      ...currentDetails.flatMap((item) => item.candidates),
    ],
  };
}
export function useAnalysisWorkspace(studio: Studio) {
  const [listing, setListing] = useState<AnalysisListing>(emptyAnalysis);
  const [error, setError] = useState('');
  const [local, setLocal] = useState<Record<string, Partial<AnalysisConversation>>>({});
  const localRef = useRef(local);
  localRef.current = local;
  const latest = useRef(studio);
  latest.current = studio;
  const queues = useRef<Record<string, Promise<unknown>>>({});
  const sequence = useRef(0);
  const jobDetails = useRef(new Map<string, AnalysisDetail>());
  const conversationDetails = useRef(new Map<string, AnalysisConversation>());
  const activeThreads = useRef(new Map<string, string>());
  for (const thread of listing.conversations)
    activeThreads.current.set(`${thread.projectId}:${thread.passageId}`, thread.id);
  const refresh = useCallback(async () => {
    const projectId = latest.current.project.id;
    const passageId = latest.current.passage.id;
    if (latest.current.project.mode !== 'local' || !window.studio?.invoke) return;
    const request = ++sequence.current;
    try {
      const data = await invoke<AnalysisListing>('analysis_list', { projectId });
      const activeThread = data.conversations.find((item) => item.passageId === passageId);
      const newest = data.jobs
        .filter(
          (job) =>
            job.passageId === passageId &&
            (!activeThread || job.conversationId === activeThread.id),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const selectedId =
        localRef.current[passageId]?.selectedCandidateId ??
        data.conversations.find((item) => item.passageId === passageId)?.selectedCandidateId;
      const selectedJob = data.jobs.find(
        (job) => selectedId && job.candidateIds.includes(selectedId),
      );
      for (const job of [newest, selectedJob].filter(
        (value, index, values) =>
          value && values.findIndex((item) => item?.id === value.id) === index,
      )) {
        if (!job) continue;
        const thread = data.conversations.find((item) => item.passageId === job.passageId);
        if (
          jobDetails.current.get(job.id)?.job.updatedAt === job.updatedAt &&
          (!thread ||
            (conversationDetails.current.get(thread.id)?.revision ?? -1) >= thread.revision)
        )
          continue;
        const detail = await invoke<AnalysisDetail>('analysis_get', { projectId, jobId: job.id });
        if (projectId === latest.current.project.id) {
          jobDetails.current.set(job.id, detail);
          if (detail.conversation)
            rememberConversation(conversationDetails.current, detail.conversation);
          if (jobDetails.current.size > 8)
            jobDetails.current.delete(jobDetails.current.keys().next().value!);
        }
      }
      if (projectId === latest.current.project.id && request === sequence.current) {
        setListing(mergeAnalysisDetails(data, jobDetails.current, conversationDetails.current));
        setError((current) =>
          current.startsWith('Não foi possível carregar a fila:') ? '' : current,
        );
      }
    } catch (failure) {
      if (projectId === latest.current.project.id)
        setError((current) =>
          current && !current.startsWith('Não foi possível carregar a fila:')
            ? current
            : `Não foi possível carregar a fila: ${analysisError(failure)}`,
        );
    }
  }, []);
  useEffect(() => {
    setListing(emptyAnalysis());
    setLocal({});
    jobDetails.current.clear();
    conversationDetails.current.clear();
    void refresh();
  }, [studio.project.id, refresh]);
  useEffect(() => {
    void refresh();
  }, [studio.passage.id, refresh]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.studio?.onEvent?.((event) => {
      if (event?.type === 'analysis' && event.projectId === latest.current.project.id && !timer)
        timer = setTimeout(() => {
          timer = undefined;
          void refresh();
        }, 100);
    });
    return () => {
      unsubscribe?.();
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!listing.jobs.some((job) => ['queued', 'running', 'cancelling'].includes(job.status)))
      return;
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [listing.jobs, refresh]);
  const conversation = listing.conversations.find((item) => item.passageId === studio.passage.id);
  const current = { ...conversation, ...local[studio.passage.id] };
  const saveConversation = useCallback(
    (
      passageId: string,
      patch: Partial<AnalysisConversation>,
      projectId = latest.current.project.id,
      conversationId = activeThreads.current.get(`${projectId}:${passageId}`),
    ) => {
      if (
        projectId === latest.current.project.id &&
        (!conversationId ||
          activeThreads.current.get(`${projectId}:${passageId}`) === conversationId)
      )
        setLocal((value) => ({ ...value, [passageId]: { ...value[passageId], ...patch } }));
      const key = `${projectId}:${passageId}`;
      const chain = queues.current[key] ?? Promise.resolve();
      const task = chain
        .catch(() => {})
        .then(async () => {
          const result = await invoke<AnalysisConversation>('analysis_composer', {
            projectId,
            passageId,
            ...(conversationId ? { conversationId } : {}),
            ...(patch.composer !== undefined ? { text: patch.composer } : {}),
            ...(patch.selectedCandidateId !== undefined
              ? { selectedCandidateId: patch.selectedCandidateId }
              : {}),
            ...(patch.scrollTop !== undefined ? { scrollTop: patch.scrollTop } : {}),
          });
          if (latest.current.project.id === projectId) {
            const retained = rememberConversation(conversationDetails.current, result);
            if (!result.archived)
              setListing((value) => ({
                ...value,
                conversations: [
                  ...value.conversations.filter((item) => item.passageId !== passageId),
                  retained,
                ],
              }));
          }
          return result;
        });
      queues.current[key] = task;
      void task.catch((failure) => setError(`A conversa não foi salva: ${analysisError(failure)}`));
      return task;
    },
    [],
  );
  const [preview, setPreview] = useState<AnalysisCandidate | null>(null);
  const [feedbackNode, setFeedbackNode] = useState<{
    candidateId: string;
    candidateRevision: string;
    nodeId: string;
  } | null>(null);
  const restoredPreview = useRef('');
  useEffect(() => {
    setPreview(null);
    setFeedbackNode(null);
    restoredPreview.current = '';
  }, [studio.passage.id, studio.project.id]);
  const savedPreview = listing.candidates.find((item) => item.id === current.selectedCandidateId);
  useEffect(() => {
    const key = `${studio.project.id}:${studio.passage.id}`;
    if (restoredPreview.current === key || !conversation) return;
    const candidate = savedPreview;
    if (!candidate) return;
    let cancelled = false;
    void invoke<{ candidates: AnalysisCandidate[] }>('analysis_get', {
      projectId: studio.project.id,
      jobId: candidate.jobId,
    })
      .then((details) => {
        if (!cancelled) {
          restoredPreview.current = key;
          setPreview(details.candidates.find((item) => item.id === candidate.id) ?? null);
        }
      })
      .catch((failure) => {
        if (!cancelled) setError(analysisError(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [
    studio.passage.id,
    studio.project.id,
    conversation?.id,
    savedPreview?.id,
    savedPreview?.revisionId,
  ]);
  const selectCandidate = async (
    candidate: AnalysisCandidate | null,
    expectedRevision?: string,
  ) => {
    setFeedbackNode(null);
    if (candidate) {
      const projectId = studio.project.id;
      const passageId = studio.passage.id;
      const details = await invoke<AnalysisDetail>('analysis_get', {
        projectId,
        jobId: candidate.jobId,
      });
      if (latest.current.project.id !== projectId || latest.current.passage.id !== passageId)
        return;
      candidate = details.candidates.find((item) => item.id === candidate!.id) ?? candidate;
      if (expectedRevision && candidate.revisionId !== expectedRevision)
        throw new Error(
          'Esta pergunta se refere a uma revisão anterior. Escolha a proposta atual e use Questionar / refinar.',
        );
      if (details.conversation)
        rememberConversation(conversationDetails.current, details.conversation);
      setListing((value) => ({
        ...value,
        candidates: [
          ...value.candidates.filter((item) => item.jobId !== details.job.id),
          ...details.candidates,
        ],
      }));
    }
    setPreview(candidate);
    await saveConversation(studio.passage.id, { selectedCandidateId: candidate?.id ?? '' });
  };
  async function loadJob(jobId: string) {
    const projectId = latest.current.project.id;
    const detail = await invoke<AnalysisDetail>('analysis_get', { projectId, jobId });
    if (latest.current.project.id !== projectId) return;
    jobDetails.current.set(jobId, detail);
    if (detail.conversation) rememberConversation(conversationDetails.current, detail.conversation);
    if (jobDetails.current.size > 8)
      jobDetails.current.delete(jobDetails.current.keys().next().value!);
    setListing((value) =>
      mergeAnalysisDetails(value, jobDetails.current, conversationDetails.current),
    );
  }
  async function openInEditor(candidate: AnalysisCandidate) {
    const before = latest.current;
    const draft = before.draft;
    if (!before.ready || !draft) throw new Error('Aguarde o carregamento do rascunho.');
    const details = await invoke<AnalysisDetail>('analysis_get', {
      projectId: before.project.id,
      jobId: candidate.jobId,
    });
    const selected = details.candidates.find((item) => item.id === candidate.id);
    if (
      latest.current.project.id !== before.project.id ||
      latest.current.passage.id !== before.passage.id ||
      latest.current.draft?.revisionId !== draft.revisionId
    )
      throw new Error('A passagem ou o rascunho mudou. Abra a proposta novamente.');
    if (
      !selected ||
      selected.projectId !== before.project.id ||
      selected.passageId !== before.passage.id ||
      !canAcceptCandidate(selected, details.job, draft.revisionId, before.project.engineFingerprint)
    )
      throw new Error('Esta proposta ainda não está pronta para abrir no editor.');
    // Opening a proposal is a deliberate draft choice. Reopening the same piece
    // keeps the contributor's layout and avoids an extra acceptance/undo step.
    const alreadyEditing =
      draft.raw === selected.raw &&
      JSON.stringify(draft.canvas?.fragments ?? []) ===
        JSON.stringify(selected.canvas?.fragments ?? []);
    if (!alreadyEditing)
      await before.acceptCandidate({
        jobId: selected.jobId,
        candidateId: selected.id,
        candidateRevision: selected.revisionId,
        expectedDraftRevision: draft.revisionId,
      });
    if (
      latest.current.project.id !== before.project.id ||
      latest.current.passage.id !== before.passage.id
    )
      throw new Error('A proposta foi preservada na passagem original.');
    await selectCandidate(null);
    return selected;
  }
  async function newConversation() {
    const projectId = latest.current.project.id,
      passageId = latest.current.passage.id;
    await queues.current[`${projectId}:${passageId}`];
    const next = await invoke<AnalysisConversation>('analysis_new_conversation', {
      projectId,
      passageId,
      operationId: crypto.randomUUID(),
    });
    if (latest.current.project.id !== projectId || latest.current.passage.id !== passageId) return;
    setLocal((value) => ({ ...value, [passageId]: {} }));
    setPreview(null);
    setFeedbackNode(null);
    rememberConversation(conversationDetails.current, next);
    await refresh();
  }
  async function openSubmittedConversation(conversationId?: string) {
    const projectId = latest.current.project.id,
      passageId = latest.current.passage.id;
    await queues.current[`${projectId}:${passageId}`];
    if (conversationId)
      await invoke('analysis_select_conversation', { projectId, passageId, conversationId });
    if (latest.current.project.id !== projectId || latest.current.passage.id !== passageId) return;
    setLocal((value) => ({ ...value, [passageId]: {} }));
    setPreview(null);
    setFeedbackNode(null);
    restoredPreview.current = '';
    await refresh();
  }
  return {
    listing,
    error,
    setError,
    refresh,
    conversation,
    current,
    saveConversation,
    preview,
    selectCandidate,
    openInEditor,
    loadJob,
    newConversation,
    openSubmittedConversation,
    feedbackNode,
    focusCandidateNode(nodeId: string, candidate = preview) {
      if (candidate)
        setFeedbackNode({
          candidateId: candidate.id,
          candidateRevision: candidate.revisionId,
          nodeId,
        });
    },
    latest,
  };
}
export type AnalysisWorkspace = ReturnType<typeof useAnalysisWorkspace>;

function CandidateMismatch({ candidate }: { candidate: AnalysisCandidate }) {
  const comparison =
    candidate.comparison?.reviewedTarget ??
    (candidate.comparison?.tentative?.expected
      ? candidate.comparison.tentative
      : candidate.comparison?.diplomatic);
  if (!comparison?.expected || comparison.spacingCase) return null;
  return (
    <p className="analysis-warning">
      Análise incompleta: gera <b lang="tpw">{comparison.actual || '∅'}</b>; a leitura informada é{' '}
      <b lang="tpw">{comparison.expected}</b>. A diferença ainda precisa ser resolvida.
    </p>
  );
}

export function CandidateProjection({
  candidate,
  onClose,
  onSelect,
  selectedNodeId,
  onEdit,
  sourceId,
  engineFingerprint,
  onReview,
  reviewBusy,
}: {
  candidate: AnalysisCandidate;
  onClose: () => void;
  onSelect: (nodeId: string) => void;
  selectedNodeId?: string;
  onEdit: (change?: CanvasEdit) => Promise<void>;
  sourceId?: string;
  engineFingerprint?: string;
  onReview?: () => void;
  reviewBusy?: boolean;
}) {
  const [selected, setSelected] = useState('root');
  const [viewCanvas, setViewCanvas] = useState<CanvasState | undefined>(candidate.canvas);
  const editing = useRef(false);
  const [editError, setEditError] = useState('');
  async function editCopy(change?: CanvasEdit) {
    if (editing.current) return;
    editing.current = true;
    try {
      setEditError('');
      await onEdit(change);
    } catch (error) {
      setEditError(analysisError(error));
    } finally {
      editing.current = false;
    }
  }
  useEffect(() => {
    if (selectedNodeId) setSelected(selectedNodeId);
  }, [selectedNodeId]);
  const evaluated = candidate.evaluation;
  const root = candidate.tree ?? evaluated?.tree;
  return (
    <section className="candidate-projection" aria-label="Prévia da proposta de IA">
      <header>
        <div>
          <strong>Proposta de IA</strong>
          <p>Ao editar, uma cópia da proposta será usada no rascunho. Você pode desfazer.</p>
        </div>
        <button
          className="button"
          onClick={() =>
            void editCopy(viewCanvas ? { raw: candidate.raw, canvas: viewCanvas } : undefined)
          }
        >
          Editar no rascunho
        </button>
        <button className="button" onClick={onClose}>
          Voltar ao meu rascunho
        </button>
        {onReview && (
          <button className="button primary" disabled={reviewBusy} onClick={onReview}>
            Usar e revisar proposta
          </button>
        )}
      </header>
      {editError && <p role="alert">{editError}</p>}
      <CandidateMismatch candidate={candidate} />
      <p className="candidate-surface" lang="tpw">
        {evaluated?.surface || 'A proposta ainda não tem resultado completo.'}
      </p>
      {root ? (
        <PydicateTree
          authoringRoot={root}
          evaluatedRoot={evaluated?.tree}
          raw={candidate.raw}
          revisionId={candidate.revisionId}
          passageId={candidate.passageId}
          canvas={viewCanvas}
          sourceId={sourceId}
          engineFingerprint={engineFingerprint}
          onChangeCanvas={(change) => {
            // Viewing layout is local; structural gestures explicitly copy into the editable draft.
            if (
              change.raw === candidate.raw &&
              JSON.stringify(change.canvas.fragments) ===
                JSON.stringify(candidate.canvas?.fragments ?? [])
            ) {
              setViewCanvas(change.canvas);
            } else void editCopy(change);
          }}
          selectedSourceNodeId={selected}
          onSelectSourceNode={(id) => {
            setSelected(id);
            onSelect(id);
          }}
          failures={evaluated?.failures}
        />
      ) : (
        <p className="field-hint">Não há uma árvore inspecionável nesta revisão.</p>
      )}
      {!!evaluated?.morphemes?.length && (
        <details>
          <summary>Morfemas da proposta</summary>
          <div className="candidate-morphemes">
            {evaluated.morphemes.map((item, index) => (
              <span key={index}>
                <b>{item.text}</b> {item.tag}
              </span>
            ))}
          </div>
        </details>
      )}
      {!!candidate.canvas?.fragments.length && (
        <details>
          <summary>Peças soltas da proposta · {candidate.canvas.fragments.length}</summary>
          {candidate.canvas.fragments.map((fragment, index) => {
            const tree = candidate.fragmentTrees?.find((item) => item.id === fragment.id)?.root;
            const evaluation = evaluated?.fragments?.find((item) => item.id === fragment.id);
            return (
              <section key={fragment.id}>
                <strong>Peça {index + 1}</strong>
                <p lang="tpw">
                  {evaluation?.result?.surface ??
                    evaluation?.error?.message ??
                    'Resultado independente não disponível'}
                </p>
                {tree ? (
                  <PydicateTree
                    authoringRoot={tree}
                    evaluatedRoot={evaluation?.result?.tree}
                    raw={fragment.raw}
                    revisionId={candidate.revisionId}
                    passageId={`candidate:${candidate.id}:${fragment.id}`}
                  />
                ) : (
                  <pre>{fragment.raw}</pre>
                )}
              </section>
            );
          })}
        </details>
      )}
      <details>
        <summary>Código da proposta</summary>
        <pre>{candidate.raw}</pre>
      </details>
    </section>
  );
}

export function AnalysisSupport({
  studio,
  layout,
  analysis,
  selectedNode,
  onEvidence,
  onPreview,
  onDictionary,
  onFocusNode,
  translationRequest = 0,
}: {
  studio: Studio;
  layout: WorkspaceLayoutController;
  analysis: AnalysisWorkspace;
  selectedNode?: AuthorNode;
  translationRequest?: number;
  onEvidence: (pointer: EvidencePointer) => void;
  onPreview: () => void;
  onDictionary: (evidence: AnalysisEvidence) => void;
  onFocusNode: (id: string, candidate?: AnalysisCandidate) => void;
}) {
  const evidence = useRef<EvidencePreparation>(null);
  const { listing, current, conversation, saveConversation, refresh, latest } = analysis;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [task, setTask] = useState<AnalysisTask>('analyze');
  const [scope, setScope] = useState<'passage' | 'constituent'>('passage');
  const [includeImages, setIncludeImages] = useState(false);
  const [provider, setProvider] = useState<AIStatus | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  useEffect(() => {
    if (translationRequest > 0) setShowTranslation(true);
  }, [translationRequest]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batch, setBatch] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyJob, setHistoryJob] = useState<string | null>(null);
  const [replyJobId, setReplyJobId] = useState<string | null>(null);
  const [replyQuestion, setReplyQuestion] = useState<{
    parentJobId: string;
    text: string;
    candidateId?: string;
    candidateRevision?: string;
    feedbackNode?: { candidateId: string; candidateRevision: string; nodeId: string };
  } | null>(null);
  const [batchEvidence, setBatchEvidence] = useState<Record<string, EvidenceStatus>>({});
  const [batchLoading, setBatchLoading] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingScroll = useRef<{
    projectId: string;
    passageId: string;
    conversationId?: string;
    value: number;
  } | null>(null);
  const activeKey = `${studio.project.id}:${studio.passage.id}`;
  const canRun =
    studio.project.mode === 'local' &&
    (studio.passage.sourceId === 'araujo_catecismo_1686' ||
      listing.jobs.some(
        (job) => job.conversationId === conversation?.id && job.input.task === 'grammar-repair',
      )) &&
    studio.ready &&
    !!studio.draft;
  const jobs = listing.jobs.filter((job) => job.passageId === studio.passage.id);
  const currentJobs = jobs.filter((job) => !conversation || job.conversationId === conversation.id);
  const isRepairConversation = currentJobs[0]?.input.task === 'grammar-repair';
  const visibleJobs = historyJob
    ? jobs.filter((job) => job.id === historyJob)
    : currentJobs.slice(0, 1);
  const historicJobs = jobs.filter((job) => job.id !== currentJobs[0]?.id);
  const candidates = listing.candidates.filter(
    (candidate) => candidate.passageId === studio.passage.id,
  );
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === current.selectedCandidateId) ?? null;
  const selection = aiSelection(selectedNode, studio.draft?.raw ?? studio.passage.sourceExpression);
  const passageRevision = studio.draft?.revisionId;
  useEffect(() => {
    setNotice('');
    setScope('passage');
    setReplyJobId(null);
    setReplyQuestion(null);
    setHistoryJob(null);
    setShowHistory(false);
    if (transcript.current) transcript.current.scrollTop = current.scrollTop ?? 0;
    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      const pending = pendingScroll.current;
      if (pending)
        void saveConversation(
          pending.passageId,
          { scrollTop: pending.value },
          pending.projectId,
          pending.conversationId,
        );
      pendingScroll.current = null;
    };
  }, [activeKey, conversation?.id]);
  useEffect(() => {
    if (!conversation || !transcript.current || current.scrollTop === undefined) return;
    if (!pendingScroll.current) transcript.current.scrollTop = current.scrollTop;
  }, [conversation?.id]);
  useEffect(() => {
    if (!batchOpen) return;
    let disposed = false;
    setBatchLoading(true);
    setBatchEvidence({});
    const projectId = studio.project.id;
    void Promise.allSettled(
      studio.project.passages
        .filter(
          (passage) =>
            passage.sourceId === 'araujo_catecismo_1686' && studio.envelope.drafts[passage.id],
        )
        .map(
          async (passage) =>
            [
              passage.id,
              await invoke<EvidenceStatus>('evidence_status', {
                projectId,
                sourceId: passage.sourceId,
                passageId: passage.id.replace(/^pending:/, 'passage:'),
              }),
            ] as const,
        ),
    ).then((results) => {
      if (disposed) return;
      setBatchEvidence(
        Object.fromEntries(
          results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
        ),
      );
      if (results.some((result) => result.status === 'rejected'))
        analysis.setError(
          'Não foi possível verificar algumas regiões salvas. Feche e reabra a fila para tentar novamente.',
        );
      setBatchLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, [batchOpen, studio.project.id, studio.project.passages.length]);
  useEffect(() => {
    if (!window.studio?.invoke) return;
    let cancelled = false;
    invoke<AIStatus>('ai_status', { projectId: studio.project.id })
      .then((value) => {
        if (!cancelled) setProvider(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [studio.project.id, showLegacy]);
  useEffect(() => {
    const explain = () => {
      setTask('explain');
      setScope('constituent');
      requestAnimationFrame(() => composer.current?.focus());
    };
    window.addEventListener('studio:explain-selection', explain);
    return () => window.removeEventListener('studio:explain-selection', explain);
  }, []);
  async function operation(run: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    analysis.setError('');
    setNotice('');
    try {
      await run();
    } catch (error) {
      analysis.setError(analysisError(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function submit(nextTask = task, requestedScope = scope) {
    if (!canRun || !studio.draft) return;
    await operation(async () => {
      const projectId = studio.project.id;
      const passageId = studio.passage.id;
      const revisionId = studio.draft!.revisionId;
      await flushLexicalNotes(projectId);
      const notebook = await invoke<{ records: LexicalNote[] }>('lexical_notes_list', {
        projectId,
      });
      const noteSnapshot = await analysisNoteSnapshot(
        notebook.records,
        studio.passage.sourceId,
        passageId,
      );
      if (
        latest.current.project.id !== projectId ||
        latest.current.passage.id !== passageId ||
        latest.current.draft?.revisionId !== revisionId
      )
        throw new Error('A passagem ou o rascunho mudou enquanto as notas eram salvas.');
      const description = current.composer ?? '';
      const repairParent =
        jobs.find((job) => job.id === (replyJobId ?? historyJob)) ?? currentJobs[0];
      if (repairParent?.input.task === 'grammar-repair') {
        if (!description.trim()) throw new Error('Escreva sua orientação para continuar.');
        await studio.persist();
        const submission = {
          projectId,
          passageId,
          revisionId,
          task: 'grammar-repair',
          scope: 'passage',
          description,
          parentJobId: repairParent.id,
        };
        await invoke('analysis_submit', {
          ...submission,
          operationId: submissionOperation(
            {
              submission,
              provider: 'codex',
              engine: studio.project.engineFingerprint,
              conversation: repairParent.conversationId,
              noteSnapshot,
            },
            listing.jobs,
          ),
        });
        await analysis.openSubmittedConversation(repairParent.conversationId);
        setHistoryJob(null);
        setShowHistory(false);
        layout.support('ai');
        return;
      }
      if (nextTask === 'revise' && replyQuestion?.candidateId) {
        const detail = await invoke<AnalysisDetail>('analysis_get', {
          projectId,
          jobId: replyQuestion.parentJobId,
        });
        const bound = detail.candidates.find(
          (candidate) => candidate.id === replyQuestion.candidateId,
        );
        if (
          !bound ||
          bound.revisionId !== replyQuestion.candidateRevision ||
          (replyQuestion.feedbackNode &&
            !flattenNodes(bound.tree ?? null).some(
              (node) => node.id === replyQuestion.feedbackNode!.nodeId,
            ))
        )
          throw new Error(
            'Esta pergunta se refere a uma revisão anterior. Escolha a proposta atual e use Questionar / refinar.',
          );
      }
      const selected = requestedScope === 'constituent' ? selection : undefined;
      if (requestedScope === 'constituent' && !selected)
        throw new Error('Selecione um constituinte atual na árvore.');
      const prepared = await evidence.current?.prepare();
      if (!prepared)
        throw new Error('A evidência ainda está carregando. Tente novamente em instantes.');
      if (includeImages && !prepared.regionIds.length)
        throw new Error(
          'Selecione e salve uma região própria desta passagem para enviar uma imagem.',
        );
      await studio.persist();
      if (
        latest.current.project.id !== projectId ||
        latest.current.passage.id !== passageId ||
        latest.current.draft?.revisionId !== revisionId
      )
        throw new Error(
          'A entrada mudou enquanto era salva. Confira-a e envie novamente. Nenhuma análise foi criada.',
        );
      const savedThread = await saveConversation(passageId, { composer: description });
      const submission = {
        projectId,
        passageId,
        revisionId,
        task: nextTask,
        scope: requestedScope,
        selectedNode: selected,
        includeImages,
        evidenceRevision: prepared.revision,
        description,
        ...(nextTask === 'revise' && replyQuestion
          ? {
              parentJobId: replyQuestion.parentJobId,
              candidateId: replyQuestion.candidateId,
              candidateRevision: replyQuestion.candidateRevision,
              feedbackNode: replyQuestion.feedbackNode,
            }
          : nextTask === 'revise' && replyJobId
            ? { parentJobId: replyJobId }
            : {}),
        ...(nextTask === 'revise' && !replyQuestion && selectedCandidate
          ? {
              parentJobId: selectedCandidate.jobId,
              candidateId: selectedCandidate.id,
              candidateRevision: selectedCandidate.revisionId,
              ...(analysis.feedbackNode?.candidateId === selectedCandidate.id &&
              analysis.feedbackNode.candidateRevision === selectedCandidate.revisionId
                ? { feedbackNode: analysis.feedbackNode }
                : {}),
            }
          : {}),
      };
      const operationId = submissionOperation(
        {
          submission,
          provider: provider?.config,
          engine: studio.project.engineFingerprint,
          conversation: savedThread.id,
          noteSnapshot,
        },
        listing.jobs,
      );
      await invoke('analysis_submit', { ...submission, operationId });
      setHistoryJob(null);
      setShowHistory(false);
      await refresh();
      if (latest.current.passage.id === passageId) layout.support('ai');
      setNotice('Entrada salva e análise na fila. Você pode continuar em outra passagem.');
    });
  }
  async function submitBatch() {
    await operation(async () => {
      const projectId = studio.project.id;
      await flushLexicalNotes(projectId);
      const notebook = await invoke<{ records: LexicalNote[] }>('lexical_notes_list', {
        projectId,
      });
      const drafts = batch.map((id) => studio.envelope.drafts[id]).filter(Boolean);
      if (drafts.length !== batch.length || !drafts.length)
        throw new Error('Selecione passagens com entradas preparadas.');
      if (batch.includes(studio.passage.id)) await evidence.current?.prepare();
      await studio.persist();
      const items = [];
      for (const draft of drafts) {
        const passage = studio.project.passages.find((item) => item.id === draft.passageId)!;
        const id = draft.passageId.replace(/^pending:/, 'passage:');
        const status = await invoke<EvidenceStatus>('evidence_status', {
          projectId,
          sourceId: passage.sourceId,
          passageId: id,
        });
        if (!preparedAnalysisInput(draft, status))
          throw new Error(
            `Prepare a transcrição, grafia provável ou uma região própria da passagem ${passage.ordinal}.`,
          );
        if (
          includeImages &&
          (!status.passage?.regions.length || status.asset?.managedState !== 'ok')
        )
          throw new Error(
            `A passagem ${passage.ordinal} não tem uma região própria com PDF disponível. Desmarque o envio de imagens ou prepare a evidência antes de enviar o lote.`,
          );
        const cache = localStorage.getItem(
          `pydicate-studio:evidence-draft:v1:${JSON.stringify([projectId, passage.sourceId, id])}`,
        );
        if (cache) {
          const unsaved = JSON.parse(cache);
          if (
            JSON.stringify(unsaved.regions) !== JSON.stringify(status.passage?.regions ?? []) ||
            JSON.stringify(unsaved.view) !== JSON.stringify(status.passage?.view)
          )
            throw new Error(
              `Salve as regiões da passagem ${passage.ordinal} antes de enviar o lote.`,
            );
        }
        if (latest.current.envelope.drafts[draft.passageId]?.revisionId !== draft.revisionId)
          throw new Error(
            `A passagem ${passage.ordinal} mudou. Revise a seleção e tente novamente.`,
          );
        const item = {
          projectId,
          passageId: draft.passageId,
          revisionId: draft.revisionId,
          task: 'analyze',
          scope: 'passage',
          evidenceRevision: status.revision,
          includeImages,
        };
        items.push({
          ...item,
          operationId: submissionOperation(
            {
              submission: item,
              provider: provider?.config,
              engine: studio.project.engineFingerprint,
              noteSnapshot: await analysisNoteSnapshot(
                notebook.records,
                passage.sourceId,
                draft.passageId,
              ),
            },
            listing.jobs,
          ),
        });
      }
      if (latest.current.project.id !== projectId)
        throw new Error('O projeto mudou. Abra novamente a fila antes de enviar.');
      const result = await invoke<{ jobs: AnalysisJob[]; errors: unknown[] }>(
        'analysis_submit_batch',
        { projectId, items },
      );
      await refresh();
      setNotice(
        `${result.jobs.length} análise(s) na fila.${result.errors.length ? ` ${result.errors.length} entrada(s) não foram enviadas: ${result.errors.map(analysisError).join('; ')}` : ''}`,
      );
      if (!result.errors.length) setBatch([]);
    });
  }
  async function openCandidate(candidate: AnalysisCandidate) {
    await operation(async () => {
      await analysis.openInEditor(candidate);
      onPreview();
      setNotice('Proposta aberta no editor. Você pode editar, revisar e desfazer.');
    });
  }
  async function answerQuestion(job: AnalysisJob, question: AnalysisQuestion) {
    await operation(async () => {
      const passageId = studio.passage.id;
      const bound = typeof question === 'string' ? { text: question } : question;
      let candidate: AnalysisCandidate | null = null;
      if (bound.candidateId) {
        const detail = await invoke<AnalysisDetail>('analysis_get', {
          projectId: studio.project.id,
          jobId: job.id,
        });
        candidate = detail.candidates.find((item) => item.id === bound.candidateId) ?? null;
        if (
          !candidate ||
          !bound.candidateRevision ||
          candidate.revisionId !== bound.candidateRevision ||
          (bound.nodeId &&
            !flattenNodes(candidate.tree ?? null).some((node) => node.id === bound.nodeId))
        )
          throw new Error(
            'Esta pergunta se refere a uma revisão anterior. Escolha a proposta atual e use Questionar / refinar.',
          );
      }
      await analysis.selectCandidate(candidate, bound.candidateRevision);
      if (latest.current.passage.id !== passageId) return;
      if (candidate && bound.nodeId) analysis.focusCandidateNode(bound.nodeId, candidate);
      setReplyQuestion({
        parentJobId: job.id,
        text: bound.text,
        ...(candidate
          ? { candidateId: candidate.id, candidateRevision: bound.candidateRevision }
          : {}),
        ...(candidate && bound.nodeId
          ? {
              feedbackNode: {
                candidateId: candidate.id,
                candidateRevision: candidate.revisionId,
                nodeId: bound.nodeId,
              },
            }
          : {}),
      });
      setTask('revise');
      setReplyJobId(job.id);
      setScope('passage');
      if (candidate) onPreview();
      composer.current?.focus();
    });
  }
  async function accept(candidate: AnalysisCandidate) {
    await operation(async () => {
      await studio.acceptCandidate({
        jobId: candidate.jobId,
        candidateId: candidate.id,
        candidateRevision: candidate.revisionId,
        expectedDraftRevision: passageRevision!,
      });
      await analysis.selectCandidate(null);
      setNotice(
        'Proposta usada no rascunho. Você pode desfazer; publicação e ground truth continuam na revisão.',
      );
      await refresh();
    });
  }
  async function useTranslation(candidate: AnalysisCandidate) {
    await operation(async () => {
      const translation = candidateTranslation(candidate);
      if (!translation) throw new Error('Esta tradução não pertence à revisão atual da proposta.');
      const currentStudio = latest.current;
      if (
        !currentStudio.draft ||
        candidate.projectId !== currentStudio.project.id ||
        candidate.passageId !== currentStudio.passage.id ||
        translation.engineFingerprint !== currentStudio.project.engineFingerprint
      )
        throw new Error('Abra a passagem e a revisão correspondentes antes de usar esta tradução.');
      let expectedRevision = currentStudio.draft.revisionId;
      if (currentStudio.draft.raw !== candidate.raw) {
        const accepted = await currentStudio.acceptCandidate({
          jobId: candidate.jobId,
          candidateId: candidate.id,
          candidateRevision: candidate.revisionId,
          expectedDraftRevision: expectedRevision,
        });
        expectedRevision = accepted.draft.revisionId;
      }
      if (
        latest.current.project.id !== candidate.projectId ||
        latest.current.passage.id !== candidate.passageId
      )
        throw new Error('A passagem mudou. A tradução continua disponível na proposta original.');
      currentStudio.edit(
        translationChange(currentStudio.draft ?? {}, translation.text, translation.language),
        expectedRevision,
      );
      await analysis.selectCandidate(null);
      layout.support('source');
      setNotice('Tradução copiada para o rascunho. Edite o texto em Fonte.');
      await refresh();
    });
  }
  function cite(item: AnalysisEvidence, candidate: AnalysisCandidate) {
    if (item.regionId) {
      layout.support('source');
      evidence.current?.focusRegion(item.regionId);
    } else if (item.nodeId) {
      onFocusNode(item.nodeId, candidate);
    } else onDictionary(item);
  }
  return (
    <section
      className={`analysis-support${showTranslation ? ' is-translating' : ''}`}
      aria-label="Fonte e assistência de IA"
    >
      <div className="support-tabs" role="tablist" aria-label="Fonte e IA">
        <button
          role="tab"
          aria-selected={layout.state.supportTab === 'source'}
          aria-controls="support-source"
          onClick={() => layout.support('source')}
        >
          Fonte
        </button>
        <button
          role="tab"
          aria-selected={layout.state.supportTab === 'ai'}
          aria-controls="support-ai"
          onClick={() => {
            setShowTranslation(false);
            layout.support('ai');
          }}
        >
          IA{' '}
          {jobs.some((job) => job.status === 'ready-for-review') && (
            <span aria-label="Há propostas prontas">●</span>
          )}
        </button>
        <button
          className="support-translate"
          disabled={!studio.draft}
          onClick={() => {
            setShowTranslation(true);
            layout.support('ai');
          }}
        >
          Traduzir árvore atual
        </button>
        <button
          className="support-jobs"
          onClick={() => {
            setShowTranslation(false);
            layout.support('ai');
            setBatchOpen(!batchOpen);
          }}
        >
          Fila ·{' '}
          {
            listing.jobs.filter((job) => ['queued', 'running', 'cancelling'].includes(job.status))
              .length
          }
        </button>
      </div>
      <div
        id="support-source"
        role="tabpanel"
        aria-label="Fonte"
        hidden={layout.state.supportTab !== 'source'}
      >
        <SourcePane
          studio={studio}
          onEvidence={onEvidence}
          preparationRef={evidence}
          onAnalyze={() => void submit('analyze', 'passage')}
          analyzing={busy}
        />
      </div>
      <div
        id="support-ai"
        role="tabpanel"
        aria-label="IA"
        hidden={layout.state.supportTab !== 'ai'}
      >
        {showTranslation && studio.draft && (
          <section className="analysis-quick-translation">
            <button className="translation-back" onClick={() => setShowTranslation(false)}>
              Voltar à conversa
            </button>
            <AssistantPanel
              translationOnly
              projectId={studio.project.id}
              passage={studio.passage}
              draft={studio.draft}
              raw={studio.draft.raw ?? studio.passage.sourceExpression}
              selectedNode={selectedNode}
              evaluation={studio.result}
              engineFingerprint={studio.project.engineFingerprint}
              onAcceptExpression={(raw) => studio.edit({ raw })}
              onAcceptTranslation={(translation, language) =>
                studio.edit(
                  translationChange(studio.draft ?? {}, translation, language),
                  studio.draft?.revisionId,
                )
              }
            />
          </section>
        )}
        <div className="analysis-context">
          <strong>Passagem {studio.passage.ordinal}</strong>
          <p lang="tpw">{studio.draft?.diplomatic || 'Sem transcrição diplomática.'}</p>
          {studio.draft?.aiInput?.tentativeReading && (
            <p>
              <small>Grafia provável</small> {studio.draft.aiInput.tentativeReading}
            </p>
          )}
          <small>
            {includeImages
              ? 'Próximo envio: recortes das regiões salvas.'
              : 'Próximo envio: texto e metadados, sem imagens.'}
          </small>
        </div>
        <div className="analysis-provider">
          <span>
            {isRepairConversation
              ? `codex · ${currentJobs[0].input.model || 'modelo padrão'}`
              : provider
                ? `${provider.config.provider} · ${provider.config.models[provider.config.provider] || 'modelo padrão'}`
                : 'Provedor local'}
          </span>
          <button onClick={() => setShowLegacy(!showLegacy)}>
            Configuração e histórico anterior
          </button>
        </div>
        {showLegacy && studio.draft && (
          <details open className="analysis-legacy">
            <summary>Configuração e solicitações anteriores</summary>
            <AssistantPanel
              configurationOnly
              onConfigured={() => {
                void invoke<AIStatus>('ai_status', { projectId: studio.project.id })
                  .then(setProvider)
                  .catch((error) => analysis.setError(analysisError(error)));
              }}
              projectId={studio.project.id}
              passage={studio.passage}
              draft={studio.draft}
              raw={studio.draft.raw ?? studio.passage.sourceExpression}
              selectedNode={selectedNode}
              evaluation={studio.result}
              engineFingerprint={studio.project.engineFingerprint}
              onAcceptExpression={(raw) => studio.edit({ raw })}
              onAcceptTranslation={(translation, language) =>
                studio.edit(translationChange(studio.draft ?? {}, translation, language))
              }
            />
          </details>
        )}
        {batchOpen && (
          <section className="analysis-queue" aria-label="Fila de análises">
            <h3>Análises do projeto</h3>
            <p>
              {listing.background.detail ||
                'O trabalho local continua enquanto o aplicativo está aberto. Ao sair, tentativas interrompidas precisam ser revisadas antes de repetir.'}
            </p>
            {listing.jobs.map((job) => (
              <div className="queue-job" key={job.id}>
                <button onClick={() => studio.setSelectedId(job.passageId)}>
                  Passagem{' '}
                  {studio.project.passages.find((item) => item.id === job.passageId)?.ordinal ??
                    'local'}{' '}
                  · {analysisLabels[job.status]}
                </button>
                <small>{analysisTasks[job.input.task]}</small>
              </div>
            ))}
            <details>
              <summary>Enviar passagens preparadas em lote</summary>
              <p>
                Usa as entradas e regiões salvas. Contexto anterior revisado fica congelado;
                hipóteses não são passadas para a linha seguinte.
              </p>
              <p className="field-hint">
                {includeImages
                  ? 'Este lote enviará imagens das regiões próprias de cada passagem.'
                  : 'Este lote enviará texto e metadados, sem imagens.'}
              </p>
              {batchLoading && <p>Verificando entradas e regiões salvas…</p>}
              {studio.project.passages
                .filter(
                  (item) =>
                    item.sourceId === 'araujo_catecismo_1686' &&
                    preparedAnalysisInput(studio.envelope.drafts[item.id], batchEvidence[item.id]),
                )
                .map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={batch.includes(item.id)}
                      onChange={(event) =>
                        setBatch((ids) =>
                          event.target.checked
                            ? [...ids, item.id]
                            : ids.filter((id) => id !== item.id),
                        )
                      }
                    />
                    Passagem {item.ordinal}
                  </label>
                ))}
              <button
                className="button"
                disabled={busy || batchLoading || !batch.length}
                onClick={() => void submitBatch()}
              >
                Analisar {batch.length} selecionada(s)
              </button>
            </details>
          </section>
        )}
        <nav className="analysis-chat-actions" aria-label="Conversas de IA">
          {jobs.length > 0 && (
            <select
              aria-label="Conversa de IA"
              value={conversation?.id ?? ''}
              disabled={busy}
              onChange={(event) => {
                const id = event.target.value;
                void operation(async () => {
                  if (scrollTimer.current) clearTimeout(scrollTimer.current);
                  pendingScroll.current = null;
                  await analysis.openSubmittedConversation(id);
                  setHistoryJob(null);
                });
              }}
            >
              {conversation && !jobs.some((job) => job.conversationId === conversation.id) && (
                <option value={conversation.id}>Nova conversa</option>
              )}
              {jobs
                .filter(
                  (job, index) =>
                    jobs.findIndex((item) => item.conversationId === job.conversationId) === index,
                )
                .map((job) => (
                  <option key={job.conversationId} value={job.conversationId}>
                    {analysisTasks[job.input.task]} ·{' '}
                    {job.input.tentativeReading ||
                      new Date(job.createdAt).toLocaleTimeString('pt-BR')}{' '}
                    · {analysisLabels[job.status]}
                  </option>
                ))}
            </select>
          )}
          <button aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}>
            Histórico ({historicJobs.length})
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void operation(async () => {
                if (scrollTimer.current) clearTimeout(scrollTimer.current);
                pendingScroll.current = null;
                await analysis.newConversation();
                setHistoryJob(null);
                setShowHistory(false);
                setReplyJobId(null);
                setReplyQuestion(null);
                setTask('analyze');
                setScope('passage');
                setNotice('Nova conversa. As anteriores continuam no Histórico.');
                requestAnimationFrame(() => composer.current?.focus());
              })
            }
          >
            Nova conversa
          </button>
        </nav>
        {showHistory && (
          <section className="analysis-history" aria-label="Histórico de conversas">
            {!historicJobs.length && <p>Nenhuma conversa anterior.</p>}
            {historicJobs.map((job) => (
              <button
                key={job.id}
                onClick={() =>
                  void operation(async () => {
                    await analysis.loadJob(job.id);
                    setHistoryJob(job.id);
                    setShowHistory(false);
                  })
                }
              >
                <strong>{analysisTasks[job.input.task]}</strong>
                <span>
                  {new Date(job.createdAt).toLocaleString('pt-BR')} · {analysisLabels[job.status]}
                </span>
              </button>
            ))}
          </section>
        )}
        {historyJob && (
          <div className="analysis-history-banner">
            Conversa anterior{' '}
            <button onClick={() => setHistoryJob(null)}>Voltar à conversa atual</button>
          </div>
        )}
        <div
          className="analysis-conversation"
          ref={transcript}
          aria-label="Conversa desta passagem"
          onScroll={() => {
            pendingScroll.current = {
              projectId: studio.project.id,
              passageId: studio.passage.id,
              conversationId: conversation?.id,
              value: transcript.current?.scrollTop ?? 0,
            };
            if (scrollTimer.current) clearTimeout(scrollTimer.current);
            scrollTimer.current = setTimeout(() => {
              const pending = pendingScroll.current;
              pendingScroll.current = null;
              if (pending)
                void saveConversation(
                  pending.passageId,
                  { scrollTop: pending.value },
                  pending.projectId,
                  pending.conversationId,
                );
            }, 300);
          }}
        >
          {!visibleJobs.length && (
            <p className="analysis-empty">
              Prepare a leitura em Fonte ou escreva uma pergunta. As propostas ficam separadas do
              seu rascunho.
            </p>
          )}
          {visibleJobs.map((job) => (
            <article className="analysis-job" key={job.id}>
              <div className="analysis-turn is-user">
                <strong>Você</strong>
                <p>{job.input.description || analysisTasks[job.input.task]}</p>
              </div>
              <header>
                <strong>{analysisTasks[job.input.task]}</strong>
                <span className={`analysis-status is-${job.status}`}>{analysisProgress(job)}</span>
              </header>
              <small>
                {job.input.scope === 'constituent'
                  ? 'Constituinte selecionado'
                  : 'Passagem inteira'}{' '}
                ·{' '}
                {job.input.task === 'translate-source'
                  ? 'Interpretação da fonte'
                  : job.input.task === 'translate-analysis'
                    ? 'Tradução da expressão; não comprova a leitura da fonte'
                    : 'Hipótese de análise'}
              </small>
              {job.input.baseRevisionId !== passageRevision && (
                <p className="analysis-warning">
                  Sua entrada mudou desde esta solicitação. Abrir a proposta usa sua árvore no
                  editor e preserva os campos de leitura; você pode desfazer.
                </p>
              )}
              {job.summary && (
                <div className="analysis-answer">
                  <strong>IA</strong>
                  <p>{readableText(job.summary)}</p>
                </div>
              )}
              {job.grammarVerification && (
                <section className="grammar-verification" aria-label="Verificação da correção">
                  <strong>
                    {job.grammarVerification.matches
                      ? 'Forma pretendida obtida'
                      : 'Resultado da verificação'}
                  </strong>
                  {job.grammarVerification.error ? (
                    <p role="alert">{job.grammarVerification.error}</p>
                  ) : (
                    <>
                      <p lang="tpw">{job.grammarVerification.surface || 'Sem resultado'}</p>
                      {!job.grammarVerification.matches && (
                        <p>Forma pretendida: {job.grammarVerification.intendedSurface}</p>
                      )}
                      {job.grammarVerification.comparison && (
                        <>
                          <p>
                            {job.grammarVerification.comparison.checked} expressões verificadas ·{' '}
                            {job.grammarVerification.comparison.changed.length} alteradas ·{' '}
                            {job.grammarVerification.comparison.baselineIssues} divergências
                            anteriores
                          </p>
                          {!!job.grammarVerification.comparison.sourceChanges.length && (
                            <p role="alert">
                              Fontes alteradas ou indisponíveis:{' '}
                              {job.grammarVerification.comparison.sourceChanges.join(', ')}
                            </p>
                          )}
                          {!!job.grammarVerification.comparison.changed.length && (
                            <details>
                              <summary>Outras formas afetadas</summary>
                              <ul>
                                {job.grammarVerification.comparison.changed.map((line) => (
                                  <li key={`${line.source}:${line.ordinal}`}>
                                    {line.source}:{line.ordinal}: {line.before} → {line.after}
                                    {line.approvedReferenceChanged &&
                                      ' · referência aprovada afetada'}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
                      )}
                    </>
                  )}
                </section>
              )}
              {!!job.grammarEdits?.length && (
                <details>
                  <summary>Alterações na gramática ({job.grammarEdits.length})</summary>
                  {job.grammarEdits.map((edit) => (
                    <div key={edit.id}>
                      <strong>{edit.path}</strong>
                      <pre>{`Antes:\n${edit.oldText}\n\nDepois:\n${edit.newText}`}</pre>
                    </div>
                  ))}
                </details>
              )}
              {!job.summary && job.status === 'running' && !!analysisStreamText(job) && (
                <div className="analysis-answer">
                  <strong>IA · Respondendo…</strong>
                  <p>{readableText(analysisStreamText(job))}</p>
                </div>
              )}
              {job.partialResponse &&
                ['blocked', 'failed', 'cancelled', 'needs-input'].includes(job.status) && (
                  <div className="analysis-answer">
                    <strong>IA · Resposta parcial</strong>
                    <p>{readableText(job.partialResponse)}</p>
                  </div>
                )}
              {job.candidateIds.length > 0 &&
                !candidates.some((candidate) => candidate.jobId === job.id) && (
                  <button
                    disabled={busy}
                    onClick={() => void operation(() => analysis.loadJob(job.id))}
                  >
                    Abrir propostas e atividade
                  </button>
                )}
              {job.error && <p role="alert">{analysisError(job.error)}</p>}
              {job.questions?.map((question, index) => (
                <blockquote key={index}>
                  {typeof question === 'string' ? question : question.text}
                  <button disabled={busy} onClick={() => void answerQuestion(job, question)}>
                    Responder
                  </button>
                </blockquote>
              ))}
              {['queued', 'running'].includes(job.status) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void operation(async () => {
                      await invoke('analysis_cancel', {
                        projectId: studio.project.id,
                        jobId: job.id,
                        operationId: crypto.randomUUID(),
                      });
                      await refresh();
                    })
                  }
                >
                  Cancelar análise
                </button>
              )}
              {['blocked', 'failed', 'cancelled', 'needs-input'].includes(job.status) && (
                <div className="analysis-resume">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void operation(async () => {
                        await invoke('analysis_resume', {
                          projectId: studio.project.id,
                          jobId: job.id,
                          operationId: crypto.randomUUID(),
                          ...(job.conversationId === conversation?.id && current.composer?.trim()
                            ? { instruction: current.composer.trim() }
                            : {}),
                        });
                        if (
                          latest.current.project.id === job.projectId &&
                          latest.current.passage.id === job.passageId
                        ) {
                          await analysis.openSubmittedConversation(job.conversationId);
                          setHistoryJob(null);
                          setShowHistory(false);
                        }
                        await refresh();
                      })
                    }
                  >
                    Retomar análise
                  </button>
                  <small>
                    Continua esta conversa com a entrada salva e o trabalho já feito. Usa o provedor
                    novamente.
                  </small>
                </div>
              )}
              {candidates
                .filter((candidate) => candidate.jobId === job.id)
                .map((candidate) => (
                  <section
                    className={`analysis-candidate${selectedCandidate?.id === candidate.id ? ' is-selected' : ''}`}
                    key={candidate.id}
                  >
                    <strong lang="tpw">
                      {candidate.evaluation?.surface || 'Proposta em construção'}
                    </strong>
                    <CandidateMismatch candidate={candidate} />
                    {candidate.evaluation?.evaluationStatus === 'partial' && (
                      <p className="analysis-warning">
                        Resultado parcial. Os ramos válidos podem ser inspecionados; as falhas ainda
                        precisam de edição.
                      </p>
                    )}
                    <p>{candidate.rationale || 'A justificativa ainda não foi registrada.'}</p>
                    {candidateTranslation(candidate) && (
                      <section className="candidate-translation" aria-label="Tradução sugerida">
                        <strong>Tradução sugerida · português</strong>
                        <p>{candidate.translation!.text}</p>
                        {!!candidate.translation!.uncertainties.length && (
                          <p className="field-hint">
                            {candidate.translation!.uncertainties.join(' ')}
                          </p>
                        )}
                        <p className="field-hint">
                          Hipótese sobre esta proposta; você pode editar depois de usá-la.
                          {!!studio.draft?.translations?.pt?.trim() &&
                            studio.draft.translations?.pt !== candidate.translation!.text &&
                            ' Usar esta sugestão substituirá sua tradução atual.'}
                        </p>
                        <button
                          disabled={
                            busy ||
                            !studio.ready ||
                            candidate.translation!.engineFingerprint !==
                              studio.project.engineFingerprint ||
                            (studio.draft?.raw !== candidate.raw &&
                              !canAcceptCandidate(
                                candidate,
                                job,
                                passageRevision ?? '',
                                studio.project.engineFingerprint,
                              ))
                          }
                          onClick={() => void useTranslation(candidate)}
                        >
                          {studio.draft?.raw !== candidate.raw
                            ? 'Usar proposta e tradução'
                            : studio.draft?.translations?.pt?.trim() &&
                                studio.draft.translations?.pt !== candidate.translation!.text
                              ? 'Substituir minha tradução por esta'
                              : 'Usar tradução no rascunho'}
                        </button>
                      </section>
                    )}
                    <p className="field-hint">
                      {candidate.comparison?.reviewedTarget
                        ? 'Leitura revisada: '
                        : candidate.comparison?.tentative?.expected
                          ? 'Grafia provável: '
                          : 'Transcrição: '}
                      {comparisonLabel(
                        candidate.comparison?.reviewedTarget ??
                          (candidate.comparison?.tentative?.expected
                            ? candidate.comparison.tentative
                            : candidate.comparison?.diplomatic) ??
                          candidate.comparison,
                      )}
                      . Coincidência não aprova a análise.
                    </p>
                    {candidate.uncertainties?.length > 0 && (
                      <details open>
                        <summary>Incertezas</summary>
                        <ul>
                          {candidate.uncertainties.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {candidate.failures?.length > 0 && (
                      <details open>
                        <summary>Limitações e falhas</summary>
                        <ul>
                          {candidate.failures.map((item, index) => (
                            <li key={index}>{analysisError(item)}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <div className="candidate-actions">
                      <button
                        disabled={busy || !studio.ready}
                        onClick={() => void openCandidate(candidate)}
                      >
                        Inspecionar na árvore
                      </button>
                      <button
                        disabled={
                          busy ||
                          !canAcceptCandidate(
                            candidate,
                            job,
                            passageRevision ?? '',
                            studio.project.engineFingerprint,
                          )
                        }
                        onClick={() => void accept(candidate)}
                      >
                        Usar no rascunho
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          void saveConversation(studio.passage.id, {
                            selectedCandidateId: candidate.id,
                          });
                          setReplyQuestion(null);
                          setTask('revise');
                          setScope('passage');
                          setReplyJobId(candidate.jobId);
                          composer.current?.focus();
                        }}
                      >
                        Questionar / refinar
                      </button>
                    </div>
                    <details>
                      <summary>Evidência e diferenças</summary>
                      <dl>
                        <dt>Meu resultado</dt>
                        <dd lang="tpw">{studio.result?.surface || 'Sem resultado'}</dd>
                        <dt>Proposta</dt>
                        <dd lang="tpw">{candidate.evaluation?.surface || 'Parcial'}</dd>
                        <dt>Sentidos e estrutura</dt>
                        <dd>
                          {flattenNodes(candidate.tree ?? candidate.evaluation?.tree ?? null)
                            .filter((node) => node.definition)
                            .map((node) => (
                              <p key={node.id}>
                                <b>{node.label}</b>: {node.definition}
                              </p>
                            ))}
                        </dd>
                      </dl>
                      {(['diplomatic', 'tentative', 'reviewedTarget'] as const).map((kind) => {
                        const comparison = candidate.comparison?.[kind];
                        if (!comparison?.expected) return null;
                        return (
                          <p key={kind}>
                            <strong>
                              {
                                {
                                  diplomatic: 'Transcrição',
                                  tentative: 'Grafia provável',
                                  reviewedTarget: 'Leitura revisada',
                                }[kind]
                              }
                            </strong>
                            : <span lang="tpw">{comparison.expected}</span>
                            <br />
                            {comparisonLabel(comparison)}.
                          </p>
                        );
                      })}
                      {candidate.evidence?.map(citationDetails).map((item, index) => (
                        <div key={index}>
                          {item.binding === 'historical' && (
                            <small className="analysis-warning">
                              Referência de etapa anterior; vínculo atual não confirmado.
                            </small>
                          )}
                          <p>
                            {item.label || item.title || item.headword || item.kind || 'Referência'}
                            {item.text ? ` · ${item.text}` : ''}
                          </p>
                          {(item.nodeId ||
                            item.regionId ||
                            item.entryId !== undefined ||
                            item.entryIndex !== undefined) && (
                            <button onClick={() => cite(item, candidate)}>Abrir referência</button>
                          )}
                        </div>
                      ))}
                      {!candidate.evidence?.length && (
                        <p>Nenhuma evidência verificável registrada.</p>
                      )}
                      <details>
                        <summary>Diferenças de código</summary>
                        <pre>{`Meu rascunho:\n${studio.draft?.raw ?? ''}\n\nProposta:\n${candidate.raw}`}</pre>
                      </details>
                    </details>
                  </section>
                ))}
              <details
                onToggle={(event) => {
                  if (event.currentTarget.open && !job.input.evidence?.regions)
                    void analysis
                      .loadJob(job.id)
                      .catch((error) => analysis.setError(analysisError(error)));
                }}
              >
                <summary>Entrada salva e atividade</summary>
                <dl>
                  <dt>Transcrição</dt>
                  <dd>{job.input.diplomatic}</dd>
                  <dt>Grafia provável</dt>
                  <dd>{job.input.tentativeReading || 'Não informada'}</dd>
                  <dt>Leitura revisada</dt>
                  <dd>{job.input.reviewedTarget || 'Não informada'}</dd>
                  <dt>Evidência</dt>
                  <dd>
                    {!job.input.evidence ||
                    (!job.input.evidence.regions &&
                      job.input.evidence.regionCount === undefined) ? (
                      'Carregando a entrada salva…'
                    ) : (
                      <>
                        {job.input.evidence.regions?.length ?? job.input.evidence.regionCount}{' '}
                        região(ões) salva(s);{' '}
                        {(job.input.evidence.images?.length ?? job.input.evidence.imageCount)
                          ? 'imagens fornecidas'
                          : 'sem pixels enviados'}
                      </>
                    )}
                  </dd>
                </dl>
                <ul className="analysis-activity">
                  {analysisActivity(job).map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
                <details>
                  <summary>Registro técnico</summary>
                  <pre>{JSON.stringify(job.events ?? [], null, 2)}</pre>
                </details>
                {job.usage && (
                  <p>
                    Tokens: {job.usage.input_tokens ?? 0} de entrada ·{' '}
                    {job.usage.output_tokens ?? 0} de saída
                  </p>
                )}
              </details>
            </article>
          ))}
        </div>
        <form
          className="analysis-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {!isRepairConversation && (
            <label>
              Tarefa
              <select
                aria-label="Tarefa da análise"
                value={task}
                onChange={(event) => {
                  setTask(event.target.value as AnalysisTask);
                  setReplyQuestion(null);
                }}
              >
                {Object.entries(analysisTasks)
                  .filter(([value]) => value !== 'grammar-repair')
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {!isRepairConversation && (
            <label>
              Escopo
              <select
                aria-label="Escopo da análise"
                value={scope}
                onChange={(event) => setScope(event.target.value as 'passage' | 'constituent')}
              >
                <option value="passage">Passagem inteira</option>
                <option value="constituent" disabled={!selection}>
                  Constituinte selecionado
                </option>
              </select>
            </label>
          )}
          {!isRepairConversation && scope === 'constituent' && (
            <p className="field-hint">
              {selection?.code || 'Selecione novamente: a expressão mudou.'}
            </p>
          )}
          {replyQuestion && (
            <div className="analysis-warning">
              <p>Respondendo: {replyQuestion.text}</p>
              <button type="button" onClick={() => setReplyQuestion(null)}>
                Cancelar resposta
              </button>
            </div>
          )}
          <textarea
            ref={composer}
            aria-label="Mensagem para a IA"
            placeholder="Uma dúvida, uma acepção diferente, um papel gramatical…"
            rows={3}
            value={current.composer ?? ''}
            onChange={(event) =>
              void saveConversation(studio.passage.id, { composer: event.target.value })
            }
          />
          {!isRepairConversation && (
            <label className="image-choice">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(event) => setIncludeImages(event.target.checked)}
              />
              Enviar imagem das regiões selecionadas
            </label>
          )}
          <button
            className="button primary"
            disabled={
              !canRun ||
              busy ||
              (!isRepairConversation && task === 'revise' && !selectedCandidate && !replyJobId) ||
              (!isRepairConversation && scope === 'constituent' && !selection) ||
              (!isRepairConversation &&
                task === 'translate-analysis' &&
                (!studio.result || studio.result.evaluationStatus === 'partial'))
            }
          >
            {busy ? 'Salvando…' : 'Salvar e enviar'}
          </button>
          {task === 'revise' && !selectedCandidate && !replyJobId && (
            <p className="field-hint">Escolha “Questionar / refinar” em uma proposta.</p>
          )}
        </form>
      </div>
      {analysis.error && (
        <p className="analysis-error" role="alert">
          {analysis.error}
          <button onClick={() => void refresh()}>Atualizar estado</button>
        </p>
      )}
      {notice && (
        <p className="analysis-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
