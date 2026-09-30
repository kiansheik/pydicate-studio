import { useEffect, useId, useRef, useState } from 'react';
import { invoke } from '../domain/authoring';
import type {
  SharedTreeEntry,
  SharedTreeRequest,
  SharedTreeTarget,
} from '../domain/shared-definition';
import { ExpressionCanvas, type ExpressionCanvasProps } from './ExpressionCanvas';
import { SharedTreeEditor } from './SharedTreeEditor';
import './TreeWorkspace.css';

interface TreeContext {
  passageId?: string;
  sourceId?: string;
  revisionId?: string;
}

interface TreeTab {
  id: string;
  name: string;
  request: SharedTreeRequest;
  context: TreeContext;
  entry?: SharedTreeEntry;
  error?: string;
  loading?: boolean;
}

const sameDefinition = (left: SharedTreeEntry | undefined, right: SharedTreeEntry) =>
  left?.sourcePath === right.sourcePath &&
  (left.target.storageId ?? left.target.declarationId) ===
    (right.target.storageId ?? right.target.declarationId);

/** One editing desk: the passage and its shared declarations retain separate drafts. */
export function TreeWorkspace(props: ExpressionCanvasProps) {
  const [tabs, setTabs] = useState<TreeTab[]>([]);
  const [active, setActive] = useState('passage');
  const activeRef = useRef(active);
  activeRef.current = active;
  const current = useRef(tabs);
  current.current = tabs;
  const generation = useRef(new Map<string, number>());
  const container = useRef<HTMLDivElement>(null);
  const id = useId();
  const mounted = useRef(true);
  const passageContext: TreeContext = {
    passageId: props.passageId,
    sourceId: props.sourceId,
    revisionId: props.revisionId,
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // A passage is a separate document; navigating must not retarget open definitions.
    setActive('passage');
  }, [props.passageId, props.sourceId]);
  useEffect(() => {
    // Keep a tab's original passage revision current while that same passage is open.
    setTabs((previous) =>
      previous.map((tab) =>
        tab.context.passageId === props.passageId &&
        tab.context.sourceId === props.sourceId &&
        tab.context.revisionId !== props.revisionId
          ? { ...tab, context: { ...tab.context, revisionId: props.revisionId } }
          : tab,
      ),
    );
  }, [props.passageId, props.sourceId, props.revisionId]);

  function activate(key: string) {
    setActive(key);
    requestAnimationFrame(() =>
      container.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  }

  async function inspect(tab: TreeTab) {
    const version = (generation.current.get(tab.id) ?? 0) + 1;
    generation.current.set(tab.id, version);
    setTabs((previous) =>
      previous.map((item) =>
        item.id === tab.id ? { ...item, loading: true, error: undefined } : item,
      ),
    );
    try {
      const target = tab.entry?.target;
      const result = await invoke<{ treeEdit?: SharedTreeTarget; sourcePath: string }>(
        'lexicon_inspect',
        {
          name: tab.request.name,
          ...tab.context,
          engineFingerprint: props.engineFingerprint,
          ...(target
            ? {
                declarationTarget: {
                  name: target.name,
                  declarationSourceId: target.sourceId,
                  declarationLine: target.line,
                  declarationId: target.declarationId,
                },
              }
            : { definitionContext: tab.request.definitionContext }),
        },
      );
      if (!result.treeEdit?.editable)
        throw new Error(
          result.treeEdit?.reason ?? 'Esta peça não tem uma árvore compartilhada editável.',
        );
      const entry: SharedTreeEntry = { target: result.treeEdit, sourcePath: result.sourcePath };
      if (mounted.current && generation.current.get(tab.id) === version) {
        const existing = current.current.find(
          (item) => item.id !== tab.id && sameDefinition(item.entry, entry),
        );
        if (existing && !tab.entry) {
          setTabs((previous) => previous.filter((item) => item.id !== tab.id));
          if (activeRef.current === tab.id) activate(existing.id);
          return;
        }
        if (existing)
          throw new Error(
            'Esta definição já está aberta em outra aba. Seu rascunho foi preservado aqui; confira as duas abas antes de atualizar.',
          );
        setTabs((previous) =>
          previous.map((item) =>
            item.id === tab.id ? { ...item, entry, loading: false, error: undefined } : item,
          ),
        );
      }
    } catch (error) {
      if (mounted.current && generation.current.get(tab.id) === version)
        setTabs((previous) =>
          previous.map((item) =>
            item.id === tab.id ? { ...item, loading: false, error: String(error) } : item,
          ),
        );
    }
  }

  function openEntry(entry: SharedTreeEntry, context = passageContext) {
    const existing = current.current.find((tab) => sameDefinition(tab.entry, entry));
    if (existing) {
      setTabs((previous) =>
        previous.map((tab) => (tab.id === existing.id ? { ...tab, entry } : tab)),
      );
      activate(existing.id);
      return;
    }
    const key = `definition:${entry.sourcePath}:${entry.target.storageId ?? entry.target.declarationId}`;
    setTabs((previous) => [
      ...previous,
      { id: key, name: entry.target.name, request: { name: entry.target.name }, context, entry },
    ]);
    activate(key);
  }

  function openReference(request: SharedTreeRequest, context = passageContext) {
    const key = `reference:${JSON.stringify([request.name, request.definitionContext?.declarationId ?? 'passage', context.sourceId, context.passageId])}`;
    const existing = current.current.find((tab) => tab.id === key);
    if (existing) {
      activate(existing.id);
      return;
    }
    const tab: TreeTab = { id: key, name: request.name, request, context, loading: true };
    setTabs((previous) => [...previous, tab]);
    activate(key);
    void inspect(tab);
  }

  useEffect(() => {
    const refresh = () => {
      for (const tab of current.current) void inspect(tab);
    };
    window.addEventListener('studio:source-applied', refresh);
    return () => window.removeEventListener('studio:source-applied', refresh);
  }, [props.passageId, props.sourceId, props.revisionId, props.engineFingerprint]);
  useEffect(() => {
    for (const tab of current.current) if (tab.entry) void inspect(tab);
  }, [props.engineFingerprint]);
  const activeName = tabs.find((tab) => tab.id === active)?.name ?? null;
  useEffect(() => {
    props.onEditingSharedTree?.(activeName);
    return () => props.onEditingSharedTree?.(null);
  }, [activeName, props.onEditingSharedTree]);
  useEffect(() => {
    const returnToPassage = () => activate('passage');
    window.addEventListener('studio:show-passage-tree', returnToPassage);
    return () => window.removeEventListener('studio:show-passage-tree', returnToPassage);
  }, []);

  function close(key: string) {
    generation.current.set(key, (generation.current.get(key) ?? 0) + 1);
    setTabs((previous) => previous.filter((tab) => tab.id !== key));
    if (active === key) activate('passage');
  }

  const all = [{ id: 'passage', name: 'Passagem' }, ...tabs];
  return (
    <div className="tree-workspace" ref={container}>
      <div
        className="tree-tabs"
        role="tablist"
        aria-label="Árvores abertas"
        onKeyDown={(event) => {
          if (
            !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) ||
            (event.target as HTMLElement).getAttribute('role') !== 'tab'
          )
            return;
          event.preventDefault();
          const index = all.findIndex((tab) => tab.id === active);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? all.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length;
          activate(all[next].id);
          container.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}
      >
        {all.map((tab, index) => (
          <div className="tree-tab" data-active={active === tab.id} key={tab.id}>
            <button
              type="button"
              role="tab"
              aria-selected={active === tab.id}
              aria-controls={`${id}-panel-${index}`}
              id={`${id}-tab-${index}`}
              tabIndex={active === tab.id ? 0 : -1}
              title={tab.name}
              onClick={() => activate(tab.id)}
            >
              {tab.name}
            </button>
            {tab.id !== 'passage' && (
              <button
                type="button"
                className="tree-tab-close"
                aria-label={`Fechar aba ${tab.name}`}
                title="Fechar aba; o rascunho é preservado"
                onClick={() => close(tab.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel-0`}
        aria-labelledby={`${id}-tab-0`}
        hidden={active !== 'passage'}
      >
        <ExpressionCanvas
          key={`${props.sourceId ?? ''}:${props.passageId ?? 'canvas'}`}
          {...props}
          inactive={active !== 'passage'}
          onOpenReference={props.onLexicalPreview ? openReference : undefined}
          onOpenSharedTree={props.onLexicalPreview ? openEntry : undefined}
        />
      </div>
      {tabs.map((tab, index) => (
        <div
          role="tabpanel"
          key={tab.id}
          id={`${id}-panel-${index + 1}`}
          aria-labelledby={`${id}-tab-${index + 1}`}
          hidden={active !== tab.id}
        >
          {tab.loading && <p role="status">Abrindo a árvore de {tab.name}…</p>}
          {tab.error && (
            <p role="alert">
              {tab.error} <button onClick={() => void inspect(tab)}>Tentar novamente</button>
            </p>
          )}
          {tab.entry && props.onLexicalPreview && (
            <SharedTreeEditor
              target={tab.entry.target}
              sourcePath={tab.entry.sourcePath}
              passageId={tab.context.passageId}
              sourceId={tab.context.sourceId}
              revisionId={tab.context.revisionId}
              engineFingerprint={props.engineFingerprint}
              onPreview={props.onLexicalPreview}
              onPrepareDiagnostic={
                props.onPrepareDiagnostic
                  ? (report) => props.onPrepareDiagnostic?.({ ...report, context: tab.context })
                  : undefined
              }
              onOpenReference={(request) => openReference(request, tab.context)}
              onOpenSharedTree={(entry) => openEntry(entry, tab.context)}
              onClose={() => activate('passage')}
              onReload={() => void inspect(tab)}
              inactive={active !== tab.id}
            />
          )}
        </div>
      ))}
    </div>
  );
}
