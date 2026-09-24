import { useEffect, useState } from 'react';
import { invoke, type NodeEvaluation } from '../domain/authoring';
import type { RenderResult } from '../domain/types';
import './OperationPreview.css';

export interface OperationPreviewProps {
  raw: string;
  passageId?: string;
  sourceId?: string;
  revisionId?: string;
  engineFingerprint?: string;
  contextKey: string;
  pendingMessage?: string;
  label?: string;
}

/** Evaluate a proposed expression without changing the working draft. */
export function OperationPreview({
  raw,
  passageId,
  sourceId,
  revisionId = '',
  engineFingerprint,
  contextKey,
  pendingMessage = 'Complete os argumentos para ver a forma resultante.',
  label = 'Prévia do resultado',
}: OperationPreviewProps) {
  const identity = JSON.stringify([
    raw,
    passageId,
    sourceId,
    revisionId,
    engineFingerprint,
    contextKey,
  ]);
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    result?: RenderResult;
    error?: string;
  } | null>(null);
  const current = snapshot?.identity === identity ? snapshot : null;
  const hasExpression = !!raw.trim();

  useEffect(() => {
    let active = true;
    setSnapshot({ identity });
    if (!raw.trim()) return;
    const timer = window.setTimeout(() => {
      void invoke<RenderResult>('evaluate_expression', {
        raw,
        passageId,
        sourceId,
        revisionId,
        engineFingerprint,
      })
        .then((result) => {
          if (!active) return;
          if (
            result.origin !== 'engine' ||
            result.expression !== raw ||
            result.revisionId !== revisionId ||
            (engineFingerprint !== undefined && result.engineFingerprint !== engineFingerprint)
          )
            throw new Error('A análise ou o motor mudou. Reabra a operação para conferir a forma.');
          setSnapshot({ identity, result });
        })
        .catch((reason: unknown) => {
          if (active)
            setSnapshot({
              identity,
              error: reason instanceof Error ? reason.message : String(reason),
            });
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [identity, raw, passageId, sourceId, revisionId, engineFingerprint]);

  const result = current?.result;
  const evaluation: NodeEvaluation | undefined =
    result?.tree?.evaluation ??
    (result && result.evaluationStatus !== 'partial' && typeof result.surface === 'string'
      ? { status: 'ok', surface: result.surface }
      : undefined);
  const pending = hasExpression && !result && !current?.error;
  const failure = result?.failures?.find((item) => item.nodeId === 'root') ?? result?.failures?.[0];
  return (
    <section className="operation-preview" aria-label={label} aria-busy={pending}>
      <strong>{label}</strong>
      <div aria-live="polite" aria-atomic="true">
        {!hasExpression ? (
          <p>{pendingMessage}</p>
        ) : pending ? (
          <p role="status">Calculando a forma…</p>
        ) : current?.error ? (
          <p className="operation-preview-diagnostic" role="alert">
            {current.error}
          </p>
        ) : evaluation?.status === 'ok' ? (
          <>
            {result?.evaluationStatus === 'partial' && <p>A avaliação ainda está incompleta.</p>}
            {evaluation.surface.trim() ? (
              <output className="operation-preview-surface" aria-label="Forma prevista">
                {evaluation.surface}
              </output>
            ) : (
              <p>A operação produz uma forma vazia.</p>
            )}
            {result?.evaluationStatus === 'partial' && failure && (
              <p className="operation-preview-diagnostic">{failure.message}</p>
            )}
          </>
        ) : evaluation?.status === 'value' ? (
          <p>
            Valor resultante: <output aria-label="Valor previsto">{evaluation.value}</output>
          </p>
        ) : (
          <>
            <p>
              {evaluation?.status === 'missing' || evaluation?.status === 'blocked'
                ? 'A composição ainda está incompleta.'
                : 'Não foi possível obter a forma.'}
            </p>
            <p className="operation-preview-diagnostic">
              {evaluation?.message ||
                failure?.message ||
                'O motor não retornou uma forma disponível.'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
