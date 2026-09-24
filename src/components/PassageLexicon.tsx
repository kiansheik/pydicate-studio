import { useEffect, useRef, useState } from 'react';
import { invoke, type SourcePreview } from '../domain/authoring';
import {
  foldLexical,
  lexicalNoteSummary,
  lexicalOccurrenceRows,
  occurrenceDefinition,
  occurrenceNoteId,
  matchesOccurrenceNote,
  type ActiveLexicalEntry,
  type LexicalNote,
  type LexicalNoteFields,
  type LexicalOccurrence,
  type PassageLexiconInventory,
} from '../domain/passage-lexicon';
import '../passage-lexicon.css';
import { registerLexicalNoteSaver, notifyLexicalNotesChanged } from '../domain/lexical-note-sync';
import {
  DictionaryMeaningPicker,
  type DictionaryMeaningSelection,
} from './DictionaryMeaningPicker';

export interface PassageLexiconProps {
  projectId: string;
  sourceId: string;
  passageId: string;
  revisionId: string;
  raw: string;
  engineFingerprint: string;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  onRevealNode?: (nodeId: string) => void;
  disabled?: boolean;
  onEdit?: (raw: string, expectedRevision: string) => boolean | void;
  onPreview?: (preview: SourcePreview) => void;
}
const kinds = {
  predicate: 'Predicado',
  compound: 'Construção reutilizada',
  alias: 'Alias',
  helper: 'Helper',
  construction: 'Construção',
  unresolved: 'Etapa incompleta',
};
const emptyFields: LexicalNoteFields = { meaning: '', grammar: '', note: '' };
type NoteInput = Omit<
  LexicalNote,
  'id' | 'version' | 'createdAt' | 'updatedAt' | 'history' | 'fields'
>;
type NoteWrite = {
  version: number;
  persisted: string;
  latest: LexicalNoteFields;
  saving: Promise<void> | null;
  note: NoteInput;
  owners: number;
};
// Reopening the same note shares its in-flight version and newest buffered fields.
// Otherwise the old and new editor could race optimistic saves of the same record.
const noteWrites = new Map<string, NoteWrite>();

function NoteEditor({
  projectId,
  note,
  saved,
  initialFields,
  onSaved,
}: {
  projectId: string;
  note: NoteInput;
  saved?: LexicalNote;
  initialFields?: LexicalNoteFields;
  onSaved: (record: LexicalNote) => void;
}) {
  const key =
    'pydicate:lexical-note-buffer:' +
    JSON.stringify([projectId, note.scope, note.lexicalId, note.passageId, note.occurrenceId]);
  const [fields, setFields] = useState<LexicalNoteFields>(() => {
    try {
      const buffered = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (
        buffered &&
        ['meaning', 'grammar', 'note'].every((field) => typeof buffered[field] === 'string')
      )
        return buffered;
    } catch {
      /* Persisted service notes remain authoritative when the buffer is unavailable. */
    }
    return noteWrites.get(key)?.latest ?? saved?.fields ?? initialFields ?? { ...emptyFields };
  });
  const [status, setStatus] = useState('');
  const write = useRef<NoteWrite>(
    noteWrites.get(key) ?? {
      version: saved?.version ?? 0,
      latest: fields,
      persisted: JSON.stringify(saved?.fields ?? initialFields ?? emptyFields),
      saving: null,
      note,
      owners: 0,
    },
  ).current;
  noteWrites.set(key, write);
  write.note = note;
  const callback = useRef(onSaved);
  callback.current = onSaved;
  const alive = useRef(true);
  const save = useRef(() => Promise.resolve());
  useEffect(() => {
    if (saved && saved.version > write.version) {
      write.version = saved.version;
      write.persisted = JSON.stringify(saved.fields);
    }
  }, [saved]);
  save.current = () => {
    if (write.saving) return write.saving;
    const operation = (async () => {
      // A flush waits for edits typed during an earlier write too. Concurrent
      // autosave, unmount and prompt requests share this single draining write.
      while (JSON.stringify(write.latest) !== write.persisted) {
        const snapshot = write.latest;
        const serialized = JSON.stringify(snapshot);
        if (alive.current) setStatus('Salvando notas…');
        try {
          const result = await invoke<LexicalNote>('lexical_notes_save', {
            projectId,
            note: { ...write.note, fields: snapshot },
            expectedVersion: write.version,
          });
          write.version = result.version;
          write.persisted = serialized;
          if (JSON.stringify(write.latest) === serialized) {
            try {
              if (localStorage.getItem(key) === serialized) localStorage.removeItem(key);
            } catch {
              /* The service has already persisted the note. */
            }
          }
          callback.current(result);
          notifyLexicalNotesChanged(projectId);
          if (alive.current) setStatus('Notas salvas neste dispositivo.');
        } catch (error) {
          if (alive.current) setStatus(String(error));
          throw error;
        }
      }
    })();
    write.saving = operation;
    const settled = () => {
      if (write.saving === operation) write.saving = null;
      if (
        !write.owners &&
        JSON.stringify(write.latest) === write.persisted &&
        noteWrites.get(key) === write
      )
        noteWrites.delete(key);
    };
    void operation.then(settled, settled);
    return operation;
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void save.current().catch(() => {});
    }, 650);
    return () => window.clearTimeout(timer);
  }, [fields]);
  useEffect(() => {
    alive.current = true;
    write.owners++;
    const unregister = registerLexicalNoteSaver(projectId, () => save.current(), key);
    return () => {
      alive.current = false;
      write.owners--;
      unregister();
    };
  }, [projectId]);
  function update(field: keyof LexicalNoteFields, value: string) {
    const next = { ...write.latest, [field]: value };
    write.latest = next;
    setFields(next);
    setStatus('Alteração pendente…');
    notifyLexicalNotesChanged(projectId);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setStatus('Salve antes de sair: o armazenamento temporário não está disponível.');
    }
  }
  return (
    <div className="lexical-note-editor">
      <label>
        {note.scope === 'entry' ? 'Significado geral' : 'Sentido atribuído aqui'}
        <textarea
          value={fields.meaning}
          rows={2}
          maxLength={50_000}
          onChange={(event) => update('meaning', event.target.value)}
        />
      </label>
      <label>
        {note.scope === 'entry'
          ? 'Gramática e observações da entrada'
          : 'Função e interpretação nesta ocorrência'}
        <textarea
          value={fields.grammar}
          rows={2}
          maxLength={50_000}
          onChange={(event) => update('grammar', event.target.value)}
        />
      </label>
      <details>
        <summary>Outras notas</summary>
        <textarea
          aria-label="Outras notas lexicais"
          rows={2}
          value={fields.note}
          onChange={(event) => update('note', event.target.value)}
        />
      </details>
      <div className="lexical-save">
        <small role="status">
          {status ||
            (saved
              ? `Salva · versão ${saved.version}`
              : 'As notas são salvas automaticamente neste dispositivo.')}
        </small>
        <button
          type="button"
          onClick={() => {
            void save.current().catch(() => {});
          }}
        >
          Salvar notas
        </button>
      </div>
    </div>
  );
}

function DefinitionEditor({
  entry,
  occurrence,
  ...props
}: PassageLexiconProps & {
  entry: ActiveLexicalEntry;
  occurrence: LexicalOccurrence;
}) {
  const target = entry.sharedDefinitionTarget;
  const [scope, setScope] = useState<'occurrence' | 'general'>('occurrence');
  const [definition, setDefinition] = useState(occurrenceDefinition(entry, occurrence));
  const [dictionarySelection, setDictionarySelection] = useState<DictionaryMeaningSelection | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const identity = JSON.stringify([
    props.projectId,
    props.passageId,
    props.revisionId,
    props.engineFingerprint,
    props.raw,
    entry.id,
    occurrence.id,
  ]);
  const live = useRef(identity);
  live.current = identity;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const canEditHere = occurrence.editable === true && !!props.onEdit;
  const canEditGeneral = !!target && !!props.onPreview;
  async function save(action: 'set' | 'inherit') {
    const requestIdentity = identity;
    setBusy(true);
    setError('');
    setNotice('');
    const dictionaryIdentity =
      action === 'set' && dictionarySelection
        ? {
            dictionarySelection: {
              entryIndex: dictionarySelection.entryIndex,
              datasetFingerprint: dictionarySelection.datasetFingerprint,
            },
          }
        : {};
    try {
      if (scope === 'general') {
        if (!target || !props.onPreview) return;
        const preview = await invoke<SourcePreview>('lexicon_update', {
          name: target.name,
          definition,
          scope: target.scope,
          preserveGrammar: true,
          ...dictionaryIdentity,
          passageId: props.passageId,
          sourceId: props.sourceId,
          revisionId: props.revisionId,
          engineFingerprint: props.engineFingerprint,
        });
        if (!alive.current || live.current !== requestIdentity) return;
        props.onPreview(preview);
      } else {
        const result = await invoke<{ raw: string; revisionId: string; engineFingerprint: string }>(
          'node_definition',
          {
            projectId: props.projectId,
            passageId: props.passageId,
            sourceId: props.sourceId,
            revisionId: props.revisionId,
            engineFingerprint: props.engineFingerprint,
            raw: props.raw,
            sourceNodeId: occurrence.sourceNodeId,
            definition,
            action,
            ...dictionaryIdentity,
          },
        );
        if (!alive.current || live.current !== requestIdentity) return;
        if (
          result.revisionId !== props.revisionId ||
          result.engineFingerprint !== props.engineFingerprint
        )
          throw new Error('A análise mudou. Reabra o significado desta etapa.');
        if (props.onEdit?.(result.raw, props.revisionId) === false)
          throw new Error('O rascunho mudou. O significado não foi aplicado.');
        setNotice(
          action === 'inherit'
            ? 'Significado herdado restaurado no rascunho.'
            : 'Significado alterado no rascunho.',
        );
      }
    } catch (reason) {
      if (alive.current && live.current === requestIdentity) setError(String(reason));
    } finally {
      if (alive.current && live.current === requestIdentity) setBusy(false);
    }
  }
  return (
    <details className="lexical-definition-editor">
      <summary>Editar significado</summary>
      <label>
        Alcance do significado
        <select
          aria-label="Alcance do significado"
          value={scope}
          disabled={busy || props.disabled}
          onChange={(event) => {
            const next = event.target.value as typeof scope;
            setScope(next);
            setDictionarySelection(null);
            setDefinition(
              next === 'general' ? entry.definition : occurrenceDefinition(entry, occurrence),
            );
            setError('');
            setNotice('');
          }}
        >
          <option value="occurrence">Nesta ocorrência</option>
          <option value="general" disabled={!canEditGeneral}>
            {target?.scope === 'source' ? 'Definição nesta fonte' : 'Definição compartilhada'}
          </option>
        </select>
      </label>
      <label>
        Significado revisado
        <textarea
          aria-label="Significado revisado"
          value={definition}
          rows={4}
          maxLength={50_000}
          disabled={
            busy || props.disabled || (scope === 'occurrence' ? !canEditHere : !canEditGeneral)
          }
          onChange={(event) => {
            setDefinition(event.target.value);
            setDictionarySelection(null);
          }}
        />
      </label>
      <DictionaryMeaningPicker
        context={{
          passageId: props.passageId,
          sourceId: props.sourceId,
          revisionId: props.revisionId,
          engineFingerprint: props.engineFingerprint,
        }}
        contextKey={`${identity}:${scope}`}
        initialQuery={occurrence.surface || entry.headword}
        disabled={
          busy || props.disabled || (scope === 'occurrence' ? !canEditHere : !canEditGeneral)
        }
        onSelect={(selection) => {
          setDefinition(selection.definition);
          setDictionarySelection(selection);
          setError('');
          setNotice('');
        }}
      />
      {dictionarySelection && (
        <p>
          Definição selecionada: {dictionarySelection.headword}
          {dictionarySelection.optionalNumber ? ` (${dictionarySelection.optionalNumber})` : ''} ·
          Navarro.
        </p>
      )}
      <p>
        {scope === 'general'
          ? target?.scope === 'source'
            ? 'A revisão atualiza a definição reutilizada nesta fonte a partir desta passagem.'
            : 'A revisão atualiza a definição usada pelas outras passagens do projeto.'
          : canEditHere
            ? 'Altera somente esta etapa da árvore no rascunho. Deixe vazio para registrar um significado ainda desconhecido.'
            : !occurrence.direct
              ? 'Esta dependência vem de uma definição reutilizada. Para mudar apenas seu uso aqui, abra e expanda a construção na árvore.'
              : 'Esta etapa ainda não produz um predicado editável. Você pode registrar sua interpretação nas notas.'}
      </p>
      {!target && (
        <p>
          Ao salvar esta passagem pela revisão normal, uma construção com significado próprio pode
          se tornar uma entrada reutilizável. Registre interpretações gerais nas notas abaixo.
        </p>
      )}
      <div className="lexical-definition-actions">
        <button
          type="button"
          disabled={
            busy || props.disabled || (scope === 'occurrence' ? !canEditHere : !canEditGeneral)
          }
          onClick={() => void save('set')}
        >
          {busy
            ? 'Conferindo…'
            : scope === 'general'
              ? 'Revisar definição geral'
              : 'Usar significado no rascunho'}
        </button>
        {scope === 'occurrence' && occurrence.hasDefinitionOverride && (
          <button
            type="button"
            disabled={busy || props.disabled || !canEditHere}
            onClick={() => void save('inherit')}
          >
            Voltar ao significado herdado
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}

export function PassageLexicon(props: PassageLexiconProps) {
  const {
    projectId,
    sourceId,
    passageId,
    revisionId,
    raw,
    engineFingerprint,
    selectedNodeId,
    onSelectNode,
    onRevealNode,
  } = props;
  const [inventory, setInventory] = useState<PassageLexiconInventory | null>(null);
  const [records, setRecords] = useState<LexicalNote[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState('');
  const [occurrenceId, setOccurrenceId] = useState('');
  const [scope, setScope] = useState<'entry' | 'occurrence'>('occurrence');
  const [noteQuery, setNoteQuery] = useState('');
  const [notesReady, setNotesReady] = useState(false);
  const [notesReload, setNotesReload] = useState(0);
  const currentProject = useRef(projectId);
  currentProject.current = projectId;
  useEffect(() => {
    let active = true;
    setInventory(null);
    setError('');
    const timer = window.setTimeout(() => {
      void invoke<PassageLexiconInventory>('passage_lexicon', {
        passageId,
        sourceId,
        raw,
        revisionId,
        engineFingerprint,
      })
        .then((result) => {
          if (
            active &&
            result.revisionId === revisionId &&
            result.engineFingerprint === engineFingerprint
          )
            setInventory(result);
        })
        .catch((reason) => {
          if (active) setError(String(reason));
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [projectId, passageId, raw, revisionId, engineFingerprint]);
  useEffect(() => {
    let active = true;
    setRecords([]);
    setNotesReady(false);
    void invoke<{ records: LexicalNote[] }>('lexical_notes_list', { projectId })
      .then((result) => {
        if (active) {
          setRecords(result.records);
          setNotesReady(true);
        }
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [projectId, notesReload]);
  useEffect(() => {
    const matches =
      inventory?.occurrences.filter((item) => item.sourceNodeId === selectedNodeId) ?? [];
    const match =
      matches.find((item) => item.id === occurrenceId) ??
      matches.find((item) => item.lexicalId === selection) ??
      matches[0];
    if (match) {
      setSelection(match.lexicalId);
      setOccurrenceId(match.id);
    }
  }, [selectedNodeId, inventory]);
  const chosen =
    inventory?.entries.find((entry) => entry.id === selection) ??
    inventory?.entries.find((entry) => entry.id === inventory.occurrences[0]?.lexicalId) ??
    inventory?.entries[0];
  const occurrences = inventory?.occurrences.filter((item) => item.lexicalId === chosen?.id) ?? [];
  const occurrence = occurrences.find((item) => item.id === occurrenceId) ?? occurrences[0];
  const filtered = lexicalOccurrenceRows(inventory, query);
  const summary = lexicalNoteSummary(records);
  const saved = records.find(
    (record) =>
      record.lexicalId === chosen?.id &&
      record.scope === scope &&
      (scope === 'entry' ||
        (occurrence &&
          matchesOccurrenceNote(
            record,
            occurrence,
            passageId,
            inventory?.expressionFingerprint ?? '',
          ) &&
          record.occurrenceId === occurrenceNoteId(occurrence))),
  );
  const legacyNote =
    !saved &&
    scope === 'occurrence' &&
    occurrence &&
    records.find(
      (record) =>
        record.scope === 'occurrence' &&
        record.lexicalId === chosen?.id &&
        record.passageId === passageId &&
        record.occurrenceId === occurrence.id &&
        record.expressionFingerprint === inventory?.expressionFingerprint,
    );
  const note =
    chosen && inventory && occurrence
      ? {
          scope,
          lexicalId: chosen.id,
          lexicalName: (chosen.lexicalName ?? chosen.name).slice(0, 500),
          ...(scope === 'occurrence'
            ? {
                sourceId,
                passageId,
                occurrenceId: occurrenceNoteId(occurrence),
                ...(occurrence.nodeFingerprint
                  ? { nodeFingerprint: occurrence.nodeFingerprint }
                  : {}),
              }
            : {}),
          revisionId,
          expressionFingerprint: inventory.expressionFingerprint,
          provenance: {
            entry: chosen.provenance,
            definition: occurrenceDefinition(chosen, occurrence),
            expression: chosen.expression,
            ...(scope === 'occurrence' ? { occurrence, engineFingerprint } : {}),
          },
        }
      : null;
  function choose(entry: ActiveLexicalEntry, item?: LexicalOccurrence) {
    setSelection(entry.id);
    setOccurrenceId(item?.id ?? '');
    const found = item ?? inventory?.occurrences.find((value) => value.lexicalId === entry.id);
    if (found) onSelectNode?.(found.sourceNodeId);
  }
  async function exportNotes() {
    try {
      const data = await invoke('lexical_notes_export', { projectId });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pydicate-notas-lexicais.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(String(reason));
    }
  }
  return (
    <section className="passage-lexicon" aria-label="Léxico ativo da passagem">
      <div className="lexical-heading">
        <div>
          <h3>Léxico desta passagem</h3>
          <p>
            Cada etapa da árvore, da expressão inteira às suas peças. Revise significados e registre
            notas nesta ocorrência ou sobre a construção em geral.
          </p>
        </div>
        <span>
          {inventory
            ? `${inventory.occurrences.filter((item) => item.direct).length} etapas · ${inventory.occurrences.filter((item) => !item.direct).length} dependências`
            : 'Lendo a árvore…'}
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      {inventory?.diagnostics.length ? (
        <details className="lexical-diagnostics">
          <summary>{inventory.diagnostics.length} observações sobre a expansão</summary>
          {inventory.diagnostics.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </details>
      ) : null}
      <input
        aria-label="Buscar no léxico desta passagem"
        type="search"
        value={query}
        placeholder="Buscar forma, etapa, significado ou classe…"
        onChange={(event) => setQuery(event.target.value)}
      />
      {inventory && (
        <div className="lexical-workspace">
          <div className="lexical-inventory" aria-label="Etapas e dependências da árvore">
            {filtered.map(({ entry, occurrence: item }) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={occurrence?.id === item.id}
                className={item.direct ? 'lexical-tree-row' : 'lexical-dependency-row'}
                style={{ paddingInlineStart: `${12 + Math.min(item.depth ?? 0, 6) * 10}px` }}
                onClick={() => choose(entry, item)}
              >
                <span>
                  <strong>{item.surface || entry.headword || item.label || entry.name}</strong>
                  <small>
                    {item.isRoot
                      ? 'Expressão inteira'
                      : !item.direct
                        ? `Dentro de ${item.via.join(' → ') || entry.name}`
                        : kinds[entry.kind]}
                  </small>
                  {(item.expression || entry.name) !== (item.surface || entry.headword) && (
                    <code>{item.expression || entry.name}</code>
                  )}
                </span>
              </button>
            ))}
            {!filtered.length && <p>Nenhuma etapa encontrada.</p>}
          </div>
          <div className="lexical-entry-detail">
            {chosen && occurrence && note ? (
              <>
                <div className="lexical-entry-title">
                  <h4>
                    {occurrence.surface || chosen.headword || occurrence.label || chosen.name}
                  </h4>
                  <span>
                    {occurrence.isRoot ? 'Expressão inteira' : kinds[chosen.kind]}
                    {chosen.category ? ` · ${chosen.category}` : ''}
                  </span>
                </div>
                <div className="lexical-engine-definition">
                  {occurrence.baseDefinition !== undefined && (
                    <p>
                      <strong>Significado da peça: </strong>
                      {occurrence.baseDefinition || 'Não informado.'}
                    </p>
                  )}
                  {occurrence.compositeDefinition !== undefined && (
                    <p>
                      <strong>Significado do conjunto: </strong>
                      {occurrence.compositeDefinition || 'Não informado.'}
                    </p>
                  )}
                  {occurrence.inheritedDefinition !== undefined && (
                    <p>
                      <strong>Definição herdada: </strong>
                      {occurrence.inheritedDefinition || 'Não informada.'}
                    </p>
                  )}
                  {occurrence.baseDefinition === undefined &&
                    occurrence.compositeDefinition === undefined && (
                      <p>
                        {occurrenceDefinition(chosen, occurrence) ||
                          'Sem significado próprio informado.'}
                      </p>
                    )}
                </div>
                {occurrence.evaluation && occurrence.evaluation.status !== 'ok' && (
                  <p className="lexical-stage-note">
                    {occurrence.evaluation.status === 'value'
                      ? `Valor: ${occurrence.evaluation.value}`
                      : occurrence.evaluation.message}
                  </p>
                )}
                {chosen.lexicalStatus === 'hypothetical' && <p>Raiz hipotética · não atestada</p>}
                <details>
                  <summary>Código e elementos no projeto</summary>
                  <pre>{occurrence.expression ?? chosen.expression}</pre>
                  {chosen.elements.map((element) => (
                    <p key={element.name}>
                      <strong>{element.name}:</strong> <code>{element.code}</code>
                    </p>
                  ))}
                  {Object.keys(chosen.runtimeAttributes ?? {}).length > 0 && (
                    <details>
                      <summary>Atributos atuais do predicado</summary>
                      {Object.entries(chosen.runtimeAttributes ?? {}).map(([name, value]) => (
                        <p key={name}>
                          <code>{name}</code>: {String(value)}
                        </p>
                      ))}
                    </details>
                  )}
                  <small>
                    {String(chosen.provenance.sourcePath ?? chosen.provenance.runtimeModule ?? '')}
                    {chosen.provenance.line ? `:${chosen.provenance.line}` : ''}
                  </small>
                </details>
                {(props.onEdit || props.onPreview) && (
                  <DefinitionEditor
                    key={JSON.stringify([
                      projectId,
                      passageId,
                      revisionId,
                      engineFingerprint,
                      chosen.id,
                      occurrence.id,
                    ])}
                    {...props}
                    entry={chosen}
                    occurrence={occurrence}
                  />
                )}
                <h5 className="lexical-notes-title">Anotações de leitura</h5>
                <div className="lexical-note-scopes" aria-label="Escopo das notas">
                  <button
                    type="button"
                    aria-pressed={scope === 'occurrence'}
                    onClick={() => setScope('occurrence')}
                  >
                    Nesta ocorrência
                  </button>
                  <button
                    type="button"
                    aria-pressed={scope === 'entry'}
                    onClick={() => setScope('entry')}
                  >
                    Sobre esta construção
                  </button>
                </div>
                {scope === 'occurrence' && (
                  <>
                    <label>
                      Ocorrência
                      <select
                        aria-label="Ocorrência lexical"
                        value={occurrence.id}
                        onChange={(event) =>
                          choose(
                            chosen,
                            occurrences.find((item) => item.id === event.target.value),
                          )
                        }
                      >
                        {occurrences.map((item, index) => (
                          <option key={item.id} value={item.id}>
                            {index + 1} ·{' '}
                            {item.isRoot
                              ? 'Expressão inteira'
                              : item.via.length
                                ? item.via.join(' → ')
                                : item.surface || item.label || 'Etapa da árvore'}
                            {item.binding ? ` · parâmetro ${item.binding.parameter}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <small>
                      {occurrence.certainty === 'candidate'
                        ? 'Dependência candidata em helper com fluxo de controle.'
                        : occurrence.via.length
                          ? `Expandida de ${occurrence.via.join(' → ')}.`
                          : 'Etapa escrita nesta expressão.'}{' '}
                      {onSelectNode && (
                        <button
                          type="button"
                          onClick={() => (onRevealNode ?? onSelectNode)(occurrence.sourceNodeId)}
                        >
                          Localizar na estrutura
                        </button>
                      )}
                    </small>
                  </>
                )}
                {notesReady ? (
                  <NoteEditor
                    key={JSON.stringify([
                      projectId,
                      notesReload,
                      scope,
                      chosen.id,
                      scope === 'occurrence' && occurrence.id,
                    ])}
                    projectId={projectId}
                    note={note}
                    saved={saved}
                    initialFields={legacyNote ? legacyNote.fields : undefined}
                    onSaved={(record) => {
                      if (currentProject.current === projectId)
                        setRecords((previous) => [
                          ...previous.filter((item) => item.id !== record.id),
                          record,
                        ]);
                    }}
                  />
                ) : (
                  <p>Carregando notas preservadas…</p>
                )}
                <small>
                  As notas preservam sua interpretação e acompanham a assistência de IA. Para
                  alterar o significado da análise, use “Editar significado”.
                </small>
              </>
            ) : (
              <p>Escolha uma entrada para inspecionar seus usos.</p>
            )}
          </div>
        </div>
      )}
      <details className="lexical-notebook">
        <summary>
          Caderno lexical do projeto · {summary.entries} entradas · {summary.occurrences}{' '}
          ocorrências anotadas
        </summary>
        <p>
          {summary.general} notas gerais · {summary.passages} passagens · {summary.revisions}{' '}
          versões preservadas
        </p>
        <div className="lexical-notebook-tools">
          <input
            type="search"
            aria-label="Buscar nas notas lexicais"
            placeholder="Buscar em todas as notas…"
            value={noteQuery}
            onChange={(event) => setNoteQuery(event.target.value)}
          />
          <button type="button" onClick={() => setNotesReload((value) => value + 1)}>
            Recarregar notas
          </button>
          <button
            type="button"
            onClick={() => {
              void exportNotes();
            }}
          >
            Exportar notas e histórico
          </button>
        </div>
        {records
          .filter((record) =>
            foldLexical([record.lexicalName, ...Object.values(record.fields)].join(' ')).includes(
              foldLexical(noteQuery),
            ),
          )
          .map((record) => (
            <details key={record.id}>
              <summary>
                <code>{record.lexicalName}</code> ·{' '}
                {record.scope === 'entry'
                  ? 'Entrada geral'
                  : record.passageId === passageId
                    ? 'Nesta passagem'
                    : 'Outra passagem'}{' '}
                · versão {record.version}
              </summary>
              <p>{record.fields.meaning}</p>
              <p>{record.fields.grammar}</p>
              <p>{record.fields.note}</p>
              <small>
                {record.sourceId} {record.passageId} · {record.updatedAt}
              </small>
              {record.scope === 'occurrence' &&
                !inventory?.occurrences.some((item) =>
                  matchesOccurrenceNote(record, item, passageId, inventory.expressionFingerprint),
                ) && (
                  <p>Nota de outra expressão ou revisão, preservada sem associação automática.</p>
                )}
              <details>
                <summary>{record.history.length} versões da nota</summary>
                {record.history.map((item) => (
                  <div key={item.version}>
                    <small>
                      v{item.version} · {item.savedAt}
                    </small>
                    <p>{Object.values(item.fields).filter(Boolean).join(' · ')}</p>
                  </div>
                ))}
              </details>
            </details>
          ))}
        {!records.length && (
          <p>
            Suas primeiras notas aparecerão aqui. O caderno reúne todas as passagens deste projeto.
          </p>
        )}
      </details>
    </section>
  );
}
