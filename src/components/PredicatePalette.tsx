import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Circle,
  Code2,
  MessageCircle,
  MoveRight,
  Sparkles,
  Type,
} from 'lucide-react';
import { invoke } from '../domain/authoring';
import { PieceSearch } from './PieceSearch';

interface Parameter {
  name: string;
  required: boolean;
  kind: 'text' | 'number' | 'boolean';
  default?: string | number | boolean | null;
  nullable: boolean;
}
interface Constructor {
  name: string;
  signature: string;
  parameters: Parameter[];
}
interface Catalog {
  constructors: Constructor[];
  engineFingerprint?: string;
}
const terms: Record<string, { label: string; hint: string; icon: typeof Type }> = {
  SizeSuffix: {
    label: 'Aumentativo ou diminutivo',
    hint: 'Sufixo que se compõe com um nome ou verbo usando /.',
    icon: Type,
  },
  Noun: { label: 'Nome', hint: 'Uma pessoa, coisa, lugar ou ideia.', icon: Type },
  ProperNoun: { label: 'Nome próprio', hint: 'Uma pessoa ou lugar com nome próprio.', icon: Type },
  Verb: { label: 'Verbo', hint: 'Uma ação, estado ou acontecimento.', icon: Sparkles },
  Pronoun: {
    label: 'Pronome',
    hint: 'Uma forma para falar de quem participa.',
    icon: MessageCircle,
  },
  Adverb: { label: 'Advérbio', hint: 'Uma circunstância: como, quando ou onde.', icon: MoveRight },
  Postposition: {
    label: 'Posposição',
    hint: 'Uma relação entre palavras ou trechos.',
    icon: MoveRight,
  },
  Interjection: {
    label: 'Interjeição',
    hint: 'Uma expressão independente ou exclamação.',
    icon: MessageCircle,
  },
  Number: { label: 'Número', hint: 'Uma quantidade ou numeral.', icon: Type },
  Particle: { label: 'Partícula', hint: 'Uma palavra com função na construção.', icon: Circle },
  Conjunction: { label: 'Conjunção', hint: 'Uma palavra que liga elementos.', icon: MoveRight },
  Demonstrative: {
    label: 'Demonstrativo',
    hint: 'Uma forma que aponta ou situa algo.',
    icon: MoveRight,
  },
  Copula: { label: 'Cópula', hint: 'Uma relação de predicação.', icon: Circle },
};
const labels: Record<string, string> = {
  verbete: 'Palavra em tupi',
  definition: 'Significado ou observações',
  inflection_or_verbete: 'Forma tupi ou identificação de pessoa',
  value: 'Palavra em tupi',
  number: 'Número',
  vid: 'Identificador no dicionário',
  verb_class: 'Classe verbal',
  tag: 'Anotação',
  category: 'Categoria no motor',
  pro_drop: 'Manter subentendido',
  inflection_override: 'Flexão explícita',
};
type Values = Record<string, string | number | boolean | null>;

/** Catalog membership and argument types come from the selected engine. The
 * labels explain existing constructors; the backend builds the source. */
export function PredicatePalette({
  passageId,
  sourceId,
  engineFingerprint,
  revisionId,
  contextKey,
  onAdd,
  onCancel,
}: {
  passageId?: string;
  sourceId?: string;
  engineFingerprint?: string;
  revisionId?: string;
  contextKey: string;
  onAdd: (expression: string) => boolean | void;
  onCancel: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [mode, setMode] = useState<'types' | 'reuse' | 'code'>('reuse');
  const [selected, setSelected] = useState<Constructor | null>(null);
  const [values, setValues] = useState<Values>({});
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const identity = `${passageId}:${sourceId}:${engineFingerprint}:${contextKey}`;
  const current = useRef(identity);
  current.current = `${identity}:${mode}:${selected?.name}`;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setCatalog(null);
    setError('');
    if (mode !== 'types') return;
    void invoke<Catalog>('predicate_catalog', { passageId, sourceId, engineFingerprint })
      .then((result) => {
        if (active) setCatalog(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [passageId, sourceId, engineFingerprint, mode]);
  function choose(constructor: Constructor) {
    setSelected(constructor);
    setError('');
    setValues({});
  }
  function field(parameter: Parameter) {
    const value = values[parameter.name] ?? parameter.default ?? '';
    return (
      <label key={parameter.name}>
        {labels[parameter.name] ?? parameter.name}
        {parameter.required ? ' *' : ''}
        {parameter.kind === 'boolean' ? (
          <select
            aria-label={labels[parameter.name] ?? parameter.name}
            value={String(value || false)}
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                [parameter.name]: event.target.value === 'true',
              }))
            }
          >
            <option value="false">Não</option>
            <option value="true">Sim</option>
          </select>
        ) : (
          <input
            aria-label={labels[parameter.name] ?? parameter.name}
            type={parameter.kind === 'number' ? 'number' : 'text'}
            value={String(value)}
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                [parameter.name]:
                  parameter.kind === 'number' && event.target.value !== ''
                    ? Number(event.target.value)
                    : event.target.value,
              }))
            }
          />
        )}
        {parameter.name === 'verb_class' && (
          <small>
            Notação do dicionário, como v.tr. ou 2ª classe. Uma entrada reconhecida pode usar a
            classe do dicionário.
          </small>
        )}
      </label>
    );
  }
  async function create() {
    if (!selected) return;
    const requested = current.current;
    setBusy(true);
    setError('');
    try {
      const supplied = Object.fromEntries(
        Object.entries(values).filter(
          ([name, value]) =>
            value !== '' ||
            selected.parameters.find((parameter) => parameter.name === name)?.required,
        ),
      );
      const result = await invoke<{ expression: string; engineFingerprint?: string }>(
        'predicate_create',
        { passageId, sourceId, engineFingerprint, constructor: selected.name, values: supplied },
      );
      if (!alive.current || requested !== current.current) return;
      onAdd(result.expression);
    } catch (reason) {
      if (alive.current && requested === current.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (alive.current && requested === current.current) setBusy(false);
    }
  }
  const primary =
    selected?.parameters.filter(
      (parameter) =>
        parameter.required ||
        ['definition', 'value', 'verbete', 'inflection_or_verbete', 'verb_class'].includes(
          parameter.name,
        ),
    ) ?? [];
  const additional = selected?.parameters.filter((parameter) => !primary.includes(parameter)) ?? [];
  return (
    <div className="predicate-palette">
      <div className="predicate-palette-tabs" role="tablist" aria-label="Como adicionar uma peça">
        <button role="tab" aria-selected={mode === 'reuse'} onClick={() => setMode('reuse')}>
          <BookOpen size={15} />
          Buscar palavra ou trecho
        </button>
        <button role="tab" aria-selected={mode === 'types'} onClick={() => setMode('types')}>
          <PlusGlyph />
          Criar peça
        </button>
        <button role="tab" aria-selected={mode === 'code'} onClick={() => setMode('code')}>
          <Code2 size={15} />
          Código
        </button>
      </div>
      {mode === 'types' && !selected && (
        <>
          <p>Escolha que tipo de peça você quer colocar no espaço.</p>
          {!catalog && !error && <p role="status">Consultando as peças disponíveis no motor…</p>}
          <div className="predicate-type-grid">
            {catalog?.constructors.map((constructor) => {
              const term = terms[constructor.name] ?? {
                label: constructor.name,
                hint: 'Peça disponível neste motor.',
                icon: Circle,
              };
              const Icon = term.icon;
              return (
                <button
                  key={constructor.name}
                  className="predicate-type-card"
                  aria-label={term.label}
                  onClick={() => choose(constructor)}
                  title={constructor.signature}
                >
                  <Icon size={22} />
                  <strong>{term.label}</strong>
                  <span>{term.hint}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {mode === 'types' && selected && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <button type="button" className="predicate-back" onClick={() => setSelected(null)}>
            <ArrowLeft size={14} />
            Tipos de peça
          </button>
          <h4>{terms[selected.name]?.label ?? selected.name}</h4>
          {primary.map(field)}
          {!!additional.length && (
            <details>
              <summary>Outras propriedades</summary>
              {additional.map(field)}
            </details>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              primary.some(
                (parameter) =>
                  parameter.required && (values[parameter.name] ?? parameter.default ?? '') === '',
              )
            }
          >
            {busy ? 'Criando…' : 'Criar e adicionar peça'}
          </button>
        </form>
      )}
      {mode === 'reuse' && (
        <PieceSearch
          passageId={passageId}
          sourceId={sourceId}
          engineFingerprint={engineFingerprint}
          revisionId={revisionId}
          contextKey={contextKey}
          onAdd={onAdd}
          autoFocus
        />
      )}
      {mode === 'code' && (
        <div>
          <label>
            Expressão Pydicate
            <textarea
              aria-label="Código da nova peça"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={3}
            />
          </label>
          <button disabled={!raw.trim()} onClick={() => onAdd(raw)}>
            Adicionar código ao espaço
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="predicate-cancel" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}
function PlusGlyph() {
  return (
    <span aria-hidden="true" className="predicate-plus-glyph">
      ＋
    </span>
  );
}
