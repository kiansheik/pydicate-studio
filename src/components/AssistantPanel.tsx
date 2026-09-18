import { useEffect, useRef, useState } from 'react';
import {
  canAcceptAI,
  aiSelection,
  aiRecordScope,
  aiPhaseLabels,
  isAIEvent,
  mergeAIRecords,
  type AIAction,
  type AIProvider,
  type AIRecord,
  type AIStatus,
  type AIScope,
} from '../domain/ai';
import type { Passage } from '../domain/types';
import '../assistant.css';

interface AssistantProps {
  configurationOnly?: boolean;
  onConfigured?: () => void;
  projectId: string;
  passage: Passage;
  draft: {
    revisionId: string;
    diplomatic: string;
    normalized: string;
    translation: string;
    notes: string;
  };
  raw: string;
  selectedNode: unknown;
  evaluation: unknown;
  engineFingerprint: string;
  onAcceptTranslation: (text: string) => void;
  onAcceptExpression: (text: string) => void;
}

const actions: Record<AIAction, string> = {
  translate: 'Traduzir para português',
  explain: 'Explicar construção',
  propose: 'Propor expressão',
  investigate: 'Investigar problema no motor',
};

function RequestProgress({ record, stale }: { record: AIRecord; stale: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (record.status !== 'streaming') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [record.status]);
  const end = record.finishedAt ? Date.parse(record.finishedAt) : now;
  const elapsed = Math.max(0, Math.floor((end - Date.parse(record.startedAt)) / 1000));
  const idle = Math.max(
    0,
    Math.floor((end - Date.parse(record.updatedAt || record.startedAt)) / 1000),
  );
  const label = record.phase
    ? aiPhaseLabels[record.phase]
    : record.status === 'streaming'
      ? record.inputContext
        ? 'Aguardando o provedor…'
        : 'Preparando o contexto local…'
      : record.status === 'completed'
        ? 'Resposta concluída'
        : record.status === 'cancelled'
          ? 'Cancelada'
          : 'Falhou';
  return (
    <p className="assistant-result-state" role="status">
      {label} · {elapsed}s{stale ? ' · revisão anterior' : ''}
      {record.status === 'streaming' && idle >= 10 && (
        <span> · sem atividade recebida há {idle}s</span>
      )}
    </p>
  );
}

export function AssistantPanel(props: AssistantProps) {
  const {
    projectId,
    passage,
    draft,
    raw,
    selectedNode,
    evaluation,
    engineFingerprint,
    onAcceptTranslation,
    onAcceptExpression,
  } = props;
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [provider, setProvider] = useState<AIProvider>('codex');
  const [model, setModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState('medium');
  const [action, setAction] = useState<AIAction>('translate');
  const [scope, setScope] = useState<AIScope>('passage');
  const [description, setDescription] = useState('');
  const [records, setRecords] = useState<AIRecord[]>([]);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<{
    record: AIRecord;
    kind: 'expression' | 'translation';
    text: string;
  } | null>(null);
  const current = useRef({ projectId, passageId: passage.id, revisionId: draft.revisionId });
  current.current = { projectId, passageId: passage.id, revisionId: draft.revisionId };

  async function refresh(verify = false) {
    if (!window.studio?.invoke) return;
    setChecking(true);
    setError('');
    try {
      const value = (await window.studio.invoke('ai_status', { verify })) as AIStatus;
      setStatus(value);
      setProvider(value.config.provider);
      setModel(value.config.models[value.config.provider]);
      setReasoningEffort(value.config.reasoningEffort || 'medium');
    } catch (problem) {
      setError(String(problem));
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    let disposed = false;
    setRecords([]);
    setCandidate(null);
    setDescription('');
    setScope('passage');
    setError('');
    const bridge = window.studio;
    if (!bridge?.invoke) return;
    void bridge
      .invoke('ai_history', { projectId, passageId: passage.id })
      .then((value) => {
        if (!disposed)
          setRecords((existing) => (value as AIRecord[]).reduce(mergeAIRecords, existing));
      })
      .catch((problem) => {
        if (!disposed) setError(String(problem));
      });
    const unsubscribe = bridge.onEvent?.((event) => {
      if (
        !disposed &&
        isAIEvent(event) &&
        event.projectId === projectId &&
        event.passageId === passage.id &&
        event.result
      )
        setRecords((existing) => mergeAIRecords(existing, event.result!));
    });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [projectId, passage.id]);
  const hasActive = records.some((record) => record.status === 'streaming');
  useEffect(() => {
    if (!hasActive || !window.studio?.invoke) return;
    let disposed = false;
    const timer = window.setInterval(() => {
      void window.studio
        ?.invoke?.('ai_history', { projectId, passageId: passage.id })
        .then((value) => {
          if (!disposed)
            setRecords((existing) => (value as AIRecord[]).reduce(mergeAIRecords, existing));
        })
        .catch((problem) => {
          if (!disposed) setError(String(problem));
        });
    }, 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [hasActive, projectId, passage.id]);

  const selection = aiSelection(selectedNode, raw);
  const requestScope = scope === 'constituent' && selection ? 'constituent' : 'passage';
  const displayedEvaluation = evaluation as { surface?: string; expression?: string } | null;

  async function start() {
    const bridge = window.studio;
    if (!bridge?.invoke) return;
    setStarting(true);
    setError('');
    const snapshot = { ...current.current };
    try {
      await bridge.invoke('ai_configure', { provider, model, reasoningEffort });
      if (
        current.current.projectId !== snapshot.projectId ||
        current.current.passageId !== snapshot.passageId ||
        current.current.revisionId !== snapshot.revisionId
      )
        throw new Error('O trecho mudou. Solicite novamente com o contexto atual.');
      await bridge.invoke('ai_start', {
        requestId: crypto.randomUUID(),
        provider,
        action,
        ...snapshot,
        context: {
          sourceId: passage.sourceId,
          ordinal: passage.ordinal,
          raw,
          scope: requestScope,
          selectedNode: requestScope === 'constituent' ? selection : null,
          evaluation:
            evaluation && typeof evaluation === 'object'
              ? Object.fromEntries(Object.entries(evaluation).filter(([key]) => key !== 'tree'))
              : null,
          selectedLexicalReference:
            requestScope === 'constituent' &&
            selectedNode &&
            typeof selectedNode === 'object' &&
            'lexicalReference' in selectedNode
              ? selectedNode.lexicalReference
              : requestScope === 'constituent' &&
                  selectedNode &&
                  typeof selectedNode === 'object' &&
                  'reference' in selectedNode
                ? selectedNode.reference
                : null,
          diplomatic: draft.diplomatic,
          normalized: draft.normalized,
          humanTranslation: draft.translation,
          notes: draft.notes,
          sourceTranslation: passage.translation,
          historicalTarget: passage.acceptedReference,
          sourceExpression: passage.sourceExpression,
          sourceFingerprint: passage.sourceFingerprint,
          witness: passage.witness,
          engineFingerprint,
          description,
        },
      });
    } catch (problem) {
      setError(String(problem));
    } finally {
      setStarting(false);
    }
  }

  async function accept() {
    if (!candidate || !window.studio?.invoke) return;
    const selected = candidate;
    if (!canAcceptAI(selected.record, projectId, passage.id, draft.revisionId)) {
      setError('Esta sugestão pertence a outra revisão. Solicite uma nova análise.');
      return;
    }
    setAccepting(selected.record.requestId);
    setError('');
    try {
      const updated = (await window.studio.invoke('ai_accept', {
        requestId: selected.record.requestId,
        projectId,
        passageId: passage.id,
        revisionId: draft.revisionId,
        kind: selected.kind,
        text: selected.text,
      })) as AIRecord;
      // Persisting human acceptance can race navigation or a raw edit. Never apply into the new draft.
      if (
        !canAcceptAI(
          selected.record,
          current.current.projectId,
          current.current.passageId,
          current.current.revisionId,
        )
      )
        throw new Error(
          'O rascunho mudou durante a aceitação; a sugestão foi preservada e não foi aplicada.',
        );
      setRecords((existing) => mergeAIRecords(existing, updated));
      if (selected.kind === 'translation') onAcceptTranslation(selected.text);
      else onAcceptExpression(selected.text);
      setCandidate(null);
    } catch (problem) {
      setError(String(problem));
    } finally {
      setAccepting(null);
    }
  }

  const connection = status?.providers.find((item) => item.id === provider);
  const configuredModel = connection?.models?.find(
    (item) => item.id === model || (!model && item.default),
  );
  const efforts = configuredModel?.supportedReasoningEfforts?.length
    ? configuredModel.supportedReasoningEfforts
    : ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
  const active = records.filter((item) => item.status === 'streaming');
  if (!window.studio?.invoke)
    return (
      <div className="assistant-panel">
        <h3>Assistência de IA</h3>
        <p>
          As conexões Codex e Claude estão disponíveis no aplicativo desktop. Nenhum provedor foi
          conectado nesta visualização.
        </p>
      </div>
    );
  return (
    <section className="assistant-panel" aria-label="Assistência de IA">
      <div className="assistant-heading">
        <h3>Assistência de IA</h3>
        <button onClick={() => void refresh(true)} disabled={checking}>
          {checking ? 'Verificando…' : 'Verificar conexão'}
        </button>
      </div>
      <div className="assistant-config">
        <label>
          Provedor
          <select
            aria-label="Provedor de IA"
            value={provider}
            onChange={(event) => {
              const next = event.target.value as AIProvider;
              setProvider(next);
              setModel(
                status?.config.models[next] ||
                  (next === 'claude' ? 'claude-haiku-4-5-20251001' : ''),
              );
            }}
          >
            <option value="codex">Codex local</option>
            <option value="claude">Claude API</option>
          </select>
        </label>
        <label>
          Modelo
          <input
            aria-label="Modelo de IA"
            value={model}
            list="assistant-models"
            placeholder={
              provider === 'codex' ? 'Padrão configurado no Codex' : 'Identificador do modelo'
            }
            onChange={(event) => setModel(event.target.value)}
          />
          <datalist id="assistant-models">
            {connection?.models?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </datalist>
        </label>
      </div>
      {provider === 'codex' && (
        <label>
          Raciocínio
          <select
            aria-label="Esforço de raciocínio"
            value={reasoningEffort}
            onChange={(event) => setReasoningEffort(event.target.value)}
          >
            {Array.from(new Set([...efforts, reasoningEffort])).map((effort) => (
              <option key={effort} value={effort}>
                {effort === 'medium'
                  ? 'Médio — equilíbrio entre tempo e análise'
                  : effort === 'low'
                    ? 'Baixo — mais rápido'
                    : effort}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="assistant-connection" role="status">
        {checking
          ? 'Consultando o provedor…'
          : connection?.detail || 'Conexão ainda não verificada.'}
      </p>
      {props.configurationOnly && (
        <button
          className="button"
          disabled={checking}
          onClick={() => {
            setChecking(true);
            setError('');
            void window.studio
              ?.invoke?.('ai_configure', { provider, model, reasoningEffort })
              .then(() => {
                props.onConfigured?.();
                return refresh();
              })
              .catch((failure) => setError(String(failure)))
              .finally(() => setChecking(false));
          }}
        >
          Salvar configuração
        </button>
      )}
      <details>
        <summary>Configuração e dados enviados</summary>
        <p>
          Codex usa o login do aplicativo de linha de comando: <code>codex login</code>. Claude usa{' '}
          <code>ANTHROPIC_API_KEY</code> no ambiente do processo desktop; a chave não entra na
          interface. Para uma chave com vários workspaces, configure também{' '}
          <code>ANTHROPIC_WORKSPACE_ID</code>.
        </p>
        {props.configurationOnly ? (
          <p>
            A nova conversa usa a entrada salva em Fonte. Imagens só acompanham a solicitação quando
            você seleciona o envio dos recortes.
          </p>
        ) : (
          <p>
            A solicitação envia a passagem inteira e, quando escolhido explicitamente, o
            constituinte selecionado, os vizinhos, os dados lexicais disponíveis, as anotações, os
            localizadores do PDF e as versões. A imagem do fac-símile não é enviada. O histórico de
            IA fica salvo no Studio e a aceitação é sempre humana.
          </p>
        )}
      </details>
      {!props.configurationOnly && (
        <>
          <label>
            Tarefa
            <select
              aria-label="Tarefa de IA"
              value={action}
              onChange={(event) => {
                setAction(event.target.value as AIAction);
                setScope('passage');
              }}
            >
              {Object.entries(actions).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Escopo da solicitação
            <select
              aria-label="Escopo da solicitação"
              value={requestScope}
              onChange={(event) => setScope(event.target.value as AIScope)}
            >
              <option value="passage">Passagem inteira</option>
              <option value="constituent" disabled={!selection}>
                Somente o constituinte selecionado
              </option>
            </select>
          </label>
          <details className="assistant-target" open>
            <summary>
              {requestScope === 'passage'
                ? `Passagem ${passage.ordinal} inteira`
                : 'Constituinte selecionado'}{' '}
              · texto que será analisado
            </summary>
            {requestScope === 'passage' &&
              displayedEvaluation?.expression === raw &&
              displayedEvaluation.surface && <p>{displayedEvaluation.surface}</p>}
            <pre aria-label="Expressão enviada para análise">
              {requestScope === 'passage' ? raw : selection?.code}
            </pre>
            {requestScope === 'constituent' && (
              <p>
                A passagem completa acompanha a seleção como contexto. Uma tradução parcial não
                substitui a tradução da passagem.
              </p>
            )}
          </details>
          <label>
            Descrição, dúvida ou contraste linguístico
            <textarea
              aria-label="Descrição para a IA"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Explique a leitura pretendida ou selecione um constituinte para consultar."
            />
          </label>
          <button
            className="assistant-primary"
            onClick={() => void start()}
            disabled={starting || active.length > 0 || checking}
          >
            {starting ? 'Preparando contexto…' : 'Solicitar assistência'}
          </button>
        </>
      )}
      {error && (
        <p className="assistant-error" role="alert">
          {error}
        </p>
      )}
      {candidate && (
        <div className="assistant-candidate">
          <h4>
            Revisar {candidate.kind === 'expression' ? 'expressão candidata' : 'tradução candidata'}
          </h4>
          <p>Esta ação altera o rascunho; a referência histórica permanece separada.</p>
          {candidate.kind === 'expression' && <pre aria-label="Expressão atual">{raw}</pre>}
          <textarea
            aria-label="Sugestão revisada"
            rows={5}
            value={candidate.text}
            onChange={(event) => setCandidate({ ...candidate, text: event.target.value })}
          />
          <button
            disabled={
              !!accepting || !canAcceptAI(candidate.record, projectId, passage.id, draft.revisionId)
            }
            onClick={() => void accept()}
          >
            {accepting ? 'Registrando…' : 'Aceitar no rascunho'}
          </button>
          <button onClick={() => setCandidate(null)}>Fechar prévia</button>
        </div>
      )}
      <div className="assistant-history">
        {records.map((record) => {
          const fresh = canAcceptAI(record, projectId, passage.id, draft.revisionId);
          const stale = record.revisionId !== draft.revisionId;
          const resultScope = aiRecordScope(record);
          return (
            <article className="assistant-result" key={record.requestId}>
              <div className="assistant-heading">
                <strong>
                  {record.action === 'translate' && resultScope !== 'passage'
                    ? 'Tradução solicitada'
                    : actions[record.action]}
                </strong>
                <span>
                  {record.provider} · {record.model || 'modelo padrão'}
                </span>
              </div>
              <RequestProgress record={record} stale={stale} />
              {resultScope === 'passage' && <p>Escopo: passagem inteira.</p>}
              {resultScope === 'constituent' && (
                <p>
                  Escopo: somente o constituinte selecionado. A tradução da passagem permanece
                  separada.
                </p>
              )}
              {resultScope === 'legacy-selection' && (
                <p className="assistant-error">
                  Solicitação antiga com seleção parcial: o escopo da tradução era ambíguo. Solicite
                  a passagem inteira para obter uma tradução completa; esta resposta foi preservada.
                </p>
              )}
              {record.suggestion ? (
                <>
                  <p>{record.suggestion.translation || record.suggestion.explanation}</p>
                  {record.suggestion.expression && <pre>{record.suggestion.expression}</pre>}
                  <p>{record.suggestion.rationale}</p>
                  {record.suggestion.regressions.length > 0 && (
                    <ul>
                      {record.suggestion.regressions.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <pre className="assistant-stream">
                  {record.text ||
                    (record.status === 'streaming'
                      ? 'O texto aparecerá aqui quando o provedor começar a responder.'
                      : 'Nenhum texto de resposta foi recebido.')}
                </pre>
              )}
              {record.error && <p className="assistant-error">{record.error}</p>}
              {record.status === 'streaming' && (
                <button
                  onClick={() =>
                    void window.studio
                      ?.invoke?.('ai_cancel', { requestId: record.requestId })
                      .catch((problem) => setError(String(problem)))
                  }
                >
                  Cancelar
                </button>
              )}
              {record.status === 'completed' && record.action === 'translate' && (
                <button
                  disabled={!fresh}
                  onClick={() =>
                    setCandidate({
                      record,
                      kind: 'translation',
                      text: record.suggestion?.translation || record.text,
                    })
                  }
                >
                  Revisar tradução
                </button>
              )}
              {record.status === 'completed' &&
                record.action === 'translate' &&
                (resultScope === 'constituent' || resultScope === 'legacy-selection') && (
                  <button
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(record.suggestion?.translation || record.text)
                        .catch((problem) => setError(String(problem)))
                    }
                  >
                    Copiar tradução parcial para revisão
                  </button>
                )}
              {record.status === 'completed' &&
                record.action === 'propose' &&
                record.suggestion?.expression && (
                  <button
                    disabled={!fresh}
                    onClick={() =>
                      setCandidate({
                        record,
                        kind: 'expression',
                        text: record.suggestion!.expression!,
                      })
                    }
                  >
                    Revisar expressão candidata
                  </button>
                )}
              {record.status === 'failed' && (
                <button
                  onClick={() => {
                    setAction(record.action);
                    setDescription(String(record.context.description || ''));
                    setProvider(record.provider);
                    setModel(record.model);
                    setReasoningEffort(record.reasoningEffort || 'medium');
                  }}
                >
                  Preparar nova tentativa
                </button>
              )}
              {record.acceptances.length > 0 && (
                <p>Aceitação humana registrada; saída original da IA preservada.</p>
              )}
              <details>
                <summary>Proveniência da solicitação</summary>
                <p>
                  {record.startedAt} · revisão {record.revisionId} · entrada{' '}
                  {record.inputHash || 'em preparação'}
                </p>
                {record.reasoningEffort && (
                  <p>Esforço de raciocínio solicitado: {record.reasoningEffort}</p>
                )}
                {record.progress && (
                  <ol>
                    {record.progress.map((entry, index) => (
                      <li key={`${entry.at}-${index}`}>
                        {aiPhaseLabels[entry.phase]} ·{' '}
                        {Math.max(
                          0,
                          Math.round((Date.parse(entry.at) - Date.parse(record.startedAt)) / 1000),
                        )}
                        s
                      </li>
                    ))}
                  </ol>
                )}
                <pre>{JSON.stringify(record.inputContext || record.context, null, 2)}</pre>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
