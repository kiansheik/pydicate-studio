import {
  LAB_MAX_LEXICAL_HINTS,
  lexicalHintCategories,
  type LabLexicalHint,
} from '../domain/parser-lab';

/** User-supplied lexical hypotheses remain explicit and have no invented gloss. */
export function LabLexicalHints({
  value,
  onChange,
  disabled = false,
}: {
  value: LabLexicalHint[];
  onChange: (hints: LabLexicalHint[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<LabLexicalHint>) {
    onChange(value.map((hint, position) => (position === index ? { ...hint, ...patch } : hint)));
  }

  return (
    <details className="lab-lexical-hints">
      <summary>
        Raízes e nomes não cadastrados{value.length > 0 ? ` (${value.length})` : ''}
      </summary>
      <p className="lab-note">
        Se faltar uma entrada no léxico, informe a raiz e uma categoria para testar sua sintaxe. Use
        a raiz sem flexão; para um nome próprio, use o nome. O motor verifica a forma, mas a raiz e
        seu significado continuam como hipótese. Até {LAB_MAX_LEXICAL_HINTS} entradas.
      </p>
      {value.map((hint, index) => (
        <div className="lab-hint-row" key={index}>
          <label>
            Raiz ou nome {index + 1}
            <input
              value={hint.root}
              maxLength={80}
              spellCheck={false}
              disabled={disabled}
              onChange={(event) => update(index, { root: event.target.value })}
            />
          </label>
          <label>
            Categoria {index + 1}
            <select
              value={hint.category}
              disabled={disabled}
              onChange={(event) =>
                update(index, { category: event.target.value as LabLexicalHint['category'] })
              }
            >
              {lexicalHintCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button small"
            aria-label={`Remover raiz ou nome ${index + 1}`}
            disabled={disabled}
            onClick={() => onChange(value.filter((_, position) => position !== index))}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        className="button small"
        disabled={disabled || value.length >= LAB_MAX_LEXICAL_HINTS}
        onClick={() => onChange([...value, { root: '', category: 'proper_noun' }])}
      >
        Adicionar raiz ou nome
      </button>
    </details>
  );
}
