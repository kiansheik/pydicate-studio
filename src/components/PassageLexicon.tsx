import { useEffect, useRef, useState } from 'react';
import { invoke } from '../domain/authoring';
import {
  foldLexical,
  lexicalNoteSummary,
  type ActiveLexicalEntry,
  type LexicalNote,
  type LexicalNoteFields,
  type LexicalOccurrence,
  type PassageLexiconInventory,
} from '../domain/passage-lexicon';
import '../passage-lexicon.css';

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
}
const kinds = {
  predicate: 'Predicado',
  compound: 'Construção reutilizada',
  alias: 'Alias',
  helper: 'Helper',
};
const emptyFields: LexicalNoteFields = { meaning: '', grammar: '', note: '' };

function NoteEditor({
  projectId,
  note,
  saved,
  onSaved,
}: {
  projectId: string;
  note: Omit<LexicalNote, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'history' | 'fields'>;
  saved?: LexicalNote;
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
    return saved?.fields ?? { ...emptyFields };
  });
  const [status, setStatus] = useState('');
  const version = useRef(saved?.version ?? 0);
  const latest = useRef(fields);
  const persisted = useRef(JSON.stringify(saved?.fields ?? emptyFields));
  const saving = useRef(Promise.resolve());
  const callback = useRef(onSaved);
  callback.current = onSaved;
  const alive = useRef(true);
  const save = useRef(() => Promise.resolve());
  useEffect(() => {
    if (saved && saved.version > version.current) {
      version.current = saved.version;
      persisted.current = JSON.stringify(saved.fields);
    }
  }, [saved]);
  save.current = () => {
    const snapshot = latest.current;
    const serialized = JSON.stringify(snapshot);
    if (serialized === persisted.current) return saving.current;
    if (alive.current) setStatus('Salvando notas…');
    const operation = saving.current
      .catch(() => {})
      .then(async () => {
        if (serialized === persisted.current) return;
        try {
          const result = await invoke<LexicalNote>('lexical_notes_save', {
            projectId,
            note: { ...note, fields: snapshot },
            expectedVersion: version.current,
          });
          version.current = result.version;
          persisted.current = serialized;
          if (JSON.stringify(latest.current) === serialized) {
            try {
              if (localStorage.getItem(key) === serialized) localStorage.removeItem(key);
            } catch {
              /* The service has already persisted the note. */
            }
          }
          callback.current(result);
          if (alive.current) setStatus('Notas salvas neste dispositivo.');
        } catch (error) {
          if (alive.current) setStatus(String(error));
        }
      });
    saving.current = operation;
    return operation;
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void save.current();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [fields]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void save.current();
    };
  }, []);
  function update(field: keyof LexicalNoteFields, value: string) {
    const next = { ...latest.current, [field]: value };
    latest.current = next;
    setFields(next);
    setStatus('Alteração pendente…');
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
            void save.current();
          }}
        >
          Salvar notas
        </button>
      </div>
    </div>
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
    inventory?.entries.find((entry) => entry.id === selection) ?? inventory?.entries[0];
  const occurrences = inventory?.occurrences.filter((item) => item.lexicalId === chosen?.id) ?? [];
  const occurrence = occurrences.find((item) => item.id === occurrenceId) ?? occurrences[0];
  const filtered =
    inventory?.entries.filter((entry) =>
      foldLexical(
        entry.name + ' ' + entry.headword + ' ' + entry.definition + ' ' + entry.category,
      ).includes(foldLexical(query)),
    ) ?? [];
  const summary = lexicalNoteSummary(records);
  const saved = records.find(
    (record) =>
      record.lexicalId === chosen?.id &&
      record.scope === scope &&
      (scope === 'entry' ||
        (record.passageId === passageId && record.occurrenceId === occurrence?.id)),
  );
  const note =
    chosen && inventory && occurrence
      ? {
          scope,
          lexicalId: chosen.id,
          lexicalName: chosen.name,
          ...(scope === 'occurrence' ? { sourceId, passageId, occurrenceId: occurrence.id } : {}),
          revisionId,
          expressionFingerprint: inventory.expressionFingerprint,
          provenance: {
            entry: chosen.provenance,
            definition: chosen.definition,
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
            Variáveis, construções reutilizadas e seus elementos. Notas gerais e sentidos de cada
            ocorrência ficam separados.
          </p>
        </div>
        <span>
          {inventory
            ? `${inventory.entries.length} entradas · ${inventory.occurrences.length} usos`
            : 'Lendo dependências…'}
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
        placeholder="Buscar variável, forma, significado ou classe…"
        onChange={(event) => setQuery(event.target.value)}
      />
      {inventory && (
        <div className="lexical-workspace">
          <div className="lexical-inventory" aria-label="Entradas usadas">
            {filtered.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={chosen?.id === entry.id}
                onClick={() => choose(entry)}
              >
                <span>
                  <code>{entry.name}</code>
                  <small>{entry.headword || kinds[entry.kind]}</small>
                </span>
                <span>{entry.occurrenceIds.length}</span>
              </button>
            ))}
            {!filtered.length && <p>Nenhuma entrada encontrada.</p>}
          </div>
          <div className="lexical-entry-detail">
            {chosen && occurrence && note ? (
              <>
                <div className="lexical-entry-title">
                  <h4>
                    <code>{chosen.name}</code>
                  </h4>
                  <span>
                    {kinds[chosen.kind]} · {chosen.category}
                  </span>
                </div>
                <p className="lexical-engine-definition">
                  {chosen.definition || 'Sem definição registrada no motor.'}
                </p>
                <details>
                  <summary>Definição e elementos no projeto</summary>
                  <pre>{chosen.expression}</pre>
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
                    {String(chosen.provenance.sourcePath ?? chosen.provenance.runtimeModule)}
                    {chosen.provenance.line ? `:${chosen.provenance.line}` : ''}
                  </small>
                </details>
                <div className="lexical-note-scopes" aria-label="Escopo das notas">
                  <button
                    type="button"
                    aria-pressed={scope === 'occurrence'}
                    onClick={() => setScope('occurrence')}
                  >
                    Nesta passagem
                  </button>
                  <button
                    type="button"
                    aria-pressed={scope === 'entry'}
                    onClick={() => setScope('entry')}
                  >
                    Sobre a entrada
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
                            {item.via.length ? item.via.join(' → ') : 'Referência direta'}
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
                          : 'Referência escrita nesta expressão.'}{' '}
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
                  Estas notas registram sua leitura. A definição do motor é editada no catálogo do
                  projeto.
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
                record.expressionFingerprint !== inventory?.expressionFingerprint && (
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
