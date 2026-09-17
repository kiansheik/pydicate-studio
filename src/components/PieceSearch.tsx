import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { LexicalInput, type LexicalInputHandle } from './LexicalInput';
import { DictionaryEntryCreation, type DictionarySelection } from './DictionaryEntryCreation';

export interface PieceSearchHandle {
  /** Immediately invalidate pending choices without removing the search textbox. */
  dismiss: () => void;
  focus: (options?: { selectAll?: boolean }) => void;
}

interface Props {
  passageId?: string;
  sourceId?: string;
  engineFingerprint?: string;
  revisionId?: string;
  contextKey: string;
  onAdd: (expression: string) => boolean | void;
  disabled?: boolean;
  autoFocus?: boolean;
  directInsert?: boolean;
  label?: string;
  onOpenChange?: (open: boolean) => void;
}

/** The canvas and its optional palette share the same verified reuse/dictionary
 * path. Closing it cancels intent; a late response cannot reopen that intent. */
export const PieceSearch = forwardRef<PieceSearchHandle, Props>(function PieceSearch(
  {
    passageId,
    sourceId,
    engineFingerprint,
    revisionId,
    contextKey,
    onAdd,
    disabled = false,
    autoFocus = false,
    directInsert = false,
    label = 'Palavra ou trecho da peça',
    onOpenChange,
  },
  ref,
) {
  const [engaged, setEngaged] = useState(autoFocus || !directInsert);
  const [reuse, setReuse] = useState('');
  const [selection, setSelection] = useState<DictionarySelection | null>(null);
  const [error, setError] = useState('');
  const [, renewIntent] = useState(0);
  const search = useRef<LexicalInputHandle>(null);
  const epoch = useRef(0);
  const identity = JSON.stringify([passageId, sourceId, engineFingerprint, revisionId, contextKey]);
  const live = useRef({ identity, engaged, disabled, onAdd, onOpenChange, mounted: true });
  live.current = {
    identity,
    engaged,
    disabled,
    onAdd,
    onOpenChange,
    mounted: live.current.mounted,
  };
  const previousIdentity = useRef(identity);
  if (previousIdentity.current !== identity) {
    previousIdentity.current = identity;
    epoch.current++;
  }
  const requestedEpoch = epoch.current;

  function activate() {
    if (live.current.disabled) return;
    live.current.engaged = true;
    setEngaged(true);
  }
  function dismiss() {
    epoch.current++;
    live.current.engaged = false;
    search.current?.dismiss();
    setEngaged(false);
    setSelection(null);
    setReuse('');
    setError('');
  }
  useImperativeHandle(ref, () => ({
    dismiss,
    focus(options) {
      // A shortcut starts a fresh choice, even when the field already has focus.
      // A previous unresolved choice must not insert while the user replaces it.
      dismiss();
      activate();
      // React may batch false → true back to the current engaged value. Refresh
      // the callback binding nevertheless, because dismiss advanced the epoch.
      renewIntent((version) => version + 1);
      search.current?.focus(options);
    },
  }));
  useEffect(() => {
    live.current.mounted = true;
    return () => {
      live.current.mounted = false;
      epoch.current++;
    };
  }, []);
  useEffect(() => {
    live.current.onOpenChange?.(engaged);
  }, [engaged]);
  useEffect(() => {
    setSelection(null);
    setReuse('');
    setError('');
    // LexicalInput retains the query and retries in the new context. An active
    // search stays active, but any previously chosen entry has lost its binding.
  }, [identity]);

  function add(expression: string) {
    if (
      !live.current.mounted ||
      !live.current.engaged ||
      live.current.disabled ||
      live.current.identity !== identity ||
      epoch.current !== requestedEpoch
    )
      return false;
    try {
      if (live.current.onAdd(expression) === false) {
        setError('A peça não foi adicionada. Confira a passagem e escolha novamente.');
        return false;
      }
      dismiss();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    }
  }
  return (
    <div
      className="piece-search"
      data-search-open={engaged}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && live.current.engaged) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <LexicalInput
        ref={search}
        label={label}
        value={reuse}
        onChange={setReuse}
        passageId={passageId}
        sourceId={sourceId}
        contextKey={identity}
        showCode={false}
        autoFocus={autoFocus}
        disabled={disabled}
        closeOnBlur={false}
        interactionActive={engaged}
        preserveQueryOnContextChange
        onActivate={activate}
        onResolved={directInsert ? (result) => add(result.expression) : undefined}
        placeholder={
          directInsert ? 'Adicionar peça: escreva em tupi ou pelo significado…' : undefined
        }
        queryStorageKey={`studio:piece-query:${sourceId ?? passageId ?? 'project'}`}
        onQueryChange={() => {
          setSelection(null);
          setError('');
        }}
        dictionary={{
          engineFingerprint,
          onChoose: (entry) =>
            setSelection({
              entryIndex: entry.entryIndex,
              datasetFingerprint: entry.datasetFingerprint,
            }),
        }}
      />
      {engaged && !directInsert && !!reuse.trim() && (
        <button disabled={disabled} onClick={() => add(reuse)}>
          <Search size={14} />
          Adicionar ao espaço
        </button>
      )}
      {engaged && selection && (
        <DictionaryEntryCreation
          key={`${selection.datasetFingerprint}:${selection.entryIndex}`}
          selection={selection}
          passageId={passageId}
          sourceId={sourceId}
          revisionId={revisionId}
          engineFingerprint={engineFingerprint}
          contextKey={identity}
          disabled={disabled}
          active={engaged}
          onInsert={add}
          onCancel={() => setSelection(null)}
        />
      )}
      {engaged && error && <p role="alert">{error}</p>}
    </div>
  );
});
