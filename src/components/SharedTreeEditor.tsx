import { useEffect, useRef, useState } from 'react';
import { invoke, type SourcePreview } from '../domain/authoring';
import { emptyCanvas, isCanvasState, type CanvasEdit, type CanvasState } from '../domain/canvas';
import type { CanvasDiagnostic } from '../domain/grammar-diagnostic';
import type {
  SharedDefinitionTarget,
  SharedTreeEvaluation,
  SharedTreeTarget,
} from '../domain/shared-definition';
import { workspaceAutofill } from '../domain/workspace-autofill';
import { ExpressionCanvas } from './ExpressionCanvas';
import './SharedTreeEditor.css';

interface DefinitionDraft extends SharedDefinitionTarget {
  raw: string;
  canvas: CanvasState;
}

export function SharedTreeEditor(props: {
  target: Extract<SharedTreeTarget, { editable: true }>;
  sourcePath: string;
  passageId?: string;
  sourceId?: string;
  revisionId?: string;
  engineFingerprint?: string;
  onPreview: (preview: SourcePreview) => void;
  onPrepareDiagnostic?: (report: CanvasDiagnostic) => void;
  onClose: () => void;
}) {
  const { target } = props;
  const storageKey = `studio:shared-tree:${JSON.stringify([props.sourcePath, target.declarationId, target.name])}`;
  const initial = (): DefinitionDraft => ({
    name: target.name,
    expectedExpression: target.expression,
    sourceFingerprint: target.sourceFingerprint,
    raw: target.expression,
    canvas: emptyCanvas(),
    declarationId: target.declarationId,
    declarationSourceId: target.sourceId,
    declarationLine: target.line,
  });
  const [draft, setDraft] = useState<DefinitionDraft>(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(storageKey) || 'null',
      ) as DefinitionDraft | null;
      if (
        saved?.name === target.name &&
        typeof saved.raw === 'string' &&
        typeof saved.expectedExpression === 'string' &&
        typeof saved.sourceFingerprint === 'string' &&
        isCanvasState(saved.canvas) &&
        saved.raw !== target.expression
      )
        return saved;
    } catch {
      /* A storage failure does not prevent editing in memory. */
    }
    return initial();
  });
  const [history, setHistory] = useState<{ past: DefinitionDraft[]; future: DefinitionDraft[] }>({
    past: [],
    future: [],
  });
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    result?: SharedTreeEvaluation;
    error?: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const identity = JSON.stringify([
    draft.raw,
    draft.expectedExpression,
    draft.sourceFingerprint,
    props.passageId,
    props.revisionId,
    props.engineFingerprint,
  ]);
  const live = useRef<string | null>(identity);
  live.current = identity;
  const stale =
    draft.expectedExpression !== target.expression ||
    draft.sourceFingerprint !== target.sourceFingerprint;
  const sharedDefinition: SharedDefinitionTarget = {
    name: target.name,
    expectedExpression: draft.expectedExpression,
    sourceFingerprint: draft.sourceFingerprint,
    declarationId: target.declarationId,
    declarationSourceId: target.sourceId,
    declarationLine: target.line,
  };
  const params = {
    ...sharedDefinition,
    raw: draft.raw,
    passageId: props.passageId,
    sourceId: props.sourceId,
    revisionId: props.revisionId,
    engineFingerprint: props.engineFingerprint,
  };
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* Keep the in-memory draft. */
    }
  }, [draft, storageKey]);
  useEffect(() => {
    let active = true;
    setSnapshot({ identity });
    if (stale || !draft.raw.trim()) return;
    const timer = setTimeout(() => {
      void invoke<SharedTreeEvaluation>('lexicon_tree_evaluate', params)
        .then((result) => {
          if (
            result.expression !== draft.raw ||
            result.revisionId !== (props.revisionId ?? '') ||
            (props.engineFingerprint && result.engineFingerprint !== props.engineFingerprint)
          )
            throw new Error(
              'A definição ou o motor mudou durante a avaliação. Atualize a árvore antes de continuar.',
            );
          if (active) setSnapshot({ identity, result });
        })
        .catch((reason) => {
          if (active) setSnapshot({ identity, error: String(reason) });
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [identity, stale]);
  useEffect(
    () => () => {
      live.current = null;
    },
    [],
  );
  const current = snapshot?.identity === identity ? snapshot : undefined;
  const result = current?.result;
  const root = result?.authoring?.root ?? result?.tree;
  const hasLoosePieces = draft.canvas.fragments.length > 0;
  function change(next: DefinitionDraft) {
    setHistory((previous) => ({ past: [...previous.past.slice(-49), draft], future: [] }));
    setDraft(next);
    setError('');
  }
  function diagnose(report: CanvasDiagnostic) {
    props.onPrepareDiagnostic?.({
      ...report,
      revisionId: props.revisionId,
      sharedDefinition: report.sharedDefinition ?? sharedDefinition,
    });
  }
  return (
    <section
      className="shared-tree-editor"
      aria-label={`Editar árvore compartilhada de ${target.name}`}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header>
        <h3>
          Editar árvore compartilhada · <code>{target.name}</code>
        </h3>
        <button onClick={props.onClose}>Fechar editor da definição</button>
      </header>
      <p>
        O nome <code>{target.name}</code> continua nas passagens. Ao aplicar a revisão, todas as
        árvores que usam esta definição serão recalculadas.
      </p>
      <p>
        Rascunho guardado nesta aba. A revisão verifica todas as passagens antes de salvar a
        definição.
      </p>
      {stale && (
        <p role="alert">
          A definição salva mudou. Seu rascunho foi mantido; confira a origem antes de continuar.
        </p>
      )}
      {(stale || draft.raw !== target.expression) && (
        <button
          disabled={busy}
          onClick={() => {
            change(initial());
          }}
        >
          Recarregar definição salva
        </button>
      )}
      <ExpressionCanvas
        raw={draft.raw}
        canvas={draft.canvas}
        authoringRoot={root}
        evaluatedRoot={result?.tree}
        passageId={props.passageId}
        sourceId={props.sourceId}
        revisionId={props.revisionId}
        engineFingerprint={props.engineFingerprint}
        sharedDefinition={sharedDefinition}
        onChangeCanvas={(edit: CanvasEdit) =>
          change({ ...draft, raw: edit.raw, canvas: edit.canvas })
        }
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => {
          const previous = history.past.at(-1);
          if (previous) {
            setHistory({ past: history.past.slice(0, -1), future: [draft, ...history.future] });
            setDraft(previous);
          }
        }}
        onRedo={() => {
          const next = history.future[0];
          if (next) {
            setHistory({ past: [...history.past, draft], future: history.future.slice(1) });
            setDraft(next);
          }
        }}
        status={current?.error ?? (!current?.result ? 'Avaliando definição…' : '')}
        failures={result?.failures}
        onLexicalPreview={props.onPreview}
        onPrepareDiagnostic={!stale && props.onPrepareDiagnostic ? diagnose : undefined}
      />
      <details>
        <summary>Expressão da árvore compartilhada</summary>
        <textarea
          {...workspaceAutofill}
          aria-label="Expressão da árvore compartilhada"
          value={draft.raw}
          onChange={(event) => change({ ...draft, raw: event.target.value })}
          rows={4}
        />
      </details>
      {result && (
        <p aria-label="Resultado da árvore compartilhada">
          Resultado: <strong>{result.surface || 'Sem resultado completo'}</strong>
        </p>
      )}
      {current?.error && <p role="alert">{current.error}</p>}
      {error && <p role="alert">{error}</p>}
      {hasLoosePieces && <p>Conecte ou retire as peças soltas antes de revisar esta definição.</p>}
      <div className="shared-tree-actions">
        {props.onPrepareDiagnostic && (
          <button
            disabled={stale || !root || busy || hasLoosePieces}
            onClick={() => {
              if (root)
                diagnose({
                  raw: draft.raw,
                  root: result?.tree ?? root,
                  selectedNodeId: root.id,
                  failures: result?.failures,
                });
            }}
          >
            Corrigir gramática desta árvore
          </button>
        )}
        <button
          disabled={busy || stale || hasLoosePieces || !draft.raw.trim()}
          onClick={async () => {
            const requestIdentity = identity;
            setBusy(true);
            setError('');
            try {
              const preview = await invoke<SourcePreview>('lexicon_tree_preview', params);
              if (live.current === requestIdentity) props.onPreview(preview);
            } catch (reason) {
              if (live.current === requestIdentity) setError(String(reason));
            } finally {
              if (live.current !== null) setBusy(false);
            }
          }}
        >
          {busy ? 'Verificando todas as passagens…' : 'Revisar árvore compartilhada'}
        </button>
      </div>
    </section>
  );
}
