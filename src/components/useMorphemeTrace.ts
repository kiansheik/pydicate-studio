import { useEffect, useMemo, useState } from 'react';
import { invoke, type AuthorNode } from '../domain/authoring';
import { expressionGraph } from '../domain/expression-tree';
import { traceMorphemes } from '../domain/morpheme-trace';
import type { RenderResult } from '../domain/types';

/** Fresh evidence for existing result labels; selection reuses the same step captures. */
export function useMorphemeTrace(input: {
  raw: string;
  root?: AuthorNode | null;
  selectedId?: string;
  pieceId?: string;
  passageId?: string;
  sourceId?: string;
  revisionId?: string;
  engineFingerprint?: string;
}) {
  const {
    raw,
    root,
    selectedId,
    pieceId,
    passageId,
    sourceId,
    revisionId = '',
    engineFingerprint,
  } = input;
  const hasRoot = !!root;
  const identity = JSON.stringify([
    raw,
    pieceId,
    passageId,
    sourceId,
    revisionId,
    engineFingerprint,
  ]);
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    result?: RenderResult;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!raw.trim() || !root) return;
    let active = true;
    setSnapshot({ identity });
    const timer = window.setTimeout(() => {
      void invoke<RenderResult>('evaluate_expression', {
        raw,
        passageId,
        sourceId,
        revisionId,
        engineFingerprint,
        includeMorphology: true,
      })
        .then((result) => {
          if (!active) return;
          if (
            result.origin !== 'engine' ||
            result.expression !== raw ||
            result.revisionId !== revisionId ||
            (engineFingerprint !== undefined && result.engineFingerprint !== engineFingerprint)
          )
            throw new Error('A árvore mudou durante o rastreamento. Aguarde a avaliação atual.');
          setSnapshot({ identity, result });
        })
        .catch((reason) => {
          if (active) setSnapshot({ identity, error: String(reason) });
        });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [identity, hasRoot]);
  const current = snapshot?.identity === identity ? snapshot : null;
  const graph = useMemo(
    () => (root && current?.result?.tree ? expressionGraph(root, raw, current.result.tree) : null),
    [root, raw, current],
  );
  // Tracing the root says nothing useful: a composition marks its whole realised form, so
  // every morpheme lights up at once. With nothing selected there is no question to answer
  // either. Both leave the surface plain.
  const trace = useMemo(
    () =>
      graph && selectedId && selectedId !== graph.rootId ? traceMorphemes(graph, selectedId) : null,
    [graph, selectedId],
  );
  return {
    graph,
    trace,
    error: current?.error,
    pending: !!raw.trim() && !current?.result && !current?.error,
  };
}
