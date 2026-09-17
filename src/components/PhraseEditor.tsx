import { CircleHelp, EyeOff, GitBranch, Minus, Users, WandSparkles } from 'lucide-react';
import type { Studio } from '../useStudio';

export const nodeLabels: Record<string, string> = {
  clause: 'Oração inteira',
  predicate: 'Predicado · apiti',
  subject: 'Sujeito · nde',
  object: 'Objeto · moro',
  mood: 'Modo da oração',
  negation: 'Negação da oração',
};
export function PhraseEditor({
  studio,
  selected,
  select,
}: {
  studio: Studio;
  selected: string;
  select: (id: string) => void;
}) {
  const { draft, edit, ready, conflict, result } = studio;
  const analysis = draft?.analysis;
  if (!analysis)
    return (
      <div className="unsupported">
        <GitBranch size={30} strokeWidth={1.3} />
        <h3>Esta construção ainda não tem editor visual</h3>
        <p>
          A expressão original está preservada na aba Código. Você pode contribuir uma leitura,
          tradução ou nota em qualquer passagem.
        </p>
        <p className="field-hint">O primeiro editor cobre a oração imperativa de Araújo 0067.</p>
      </div>
    );
  const disabled = !ready || conflict;
  const control = (id: string, className = '') => ({
    className: `${className} ${selected === id ? 'is-selected' : ''}`,
    'data-node-id': id,
    'aria-pressed': selected === id,
    onClick: () => select(id),
  });
  return (
    <div className="construction-view">
      <div className="section-intro">
        <div>
          <h2>Uma oração, parte por parte</h2>
          <p>Selecione uma parte para explorar sua função.</p>
        </div>
        <span className="quiet-label">
          <GitBranch size={14} /> Estrutura da análise
        </span>
      </div>
      <div className={`clause-card ${analysis.negated ? 'negated' : ''}`}>
        {analysis.negated && (
          <button {...control('negation', 'scope-label')}>
            <Minus size={13} /> NEGAÇÃO <span>envolve a oração inteira</span>
          </button>
        )}
        <div className="clause-inner">
          <div className="clause-header">
            <button {...control('clause', 'clause-title')}>
              <span className="node-dot" /> Oração
            </button>
            <div className="clause-badges">
              <button {...control('mood', 'tag')}>
                {analysis.mood === 'imperative' ? 'Imperativo' : 'Indicativo'}
              </button>
              {analysis.negated && <span className="tag amber">Negada</span>}
            </div>
          </div>
          <div className="participant-grid">
            <button {...control('subject', 'phrase-card subject-card')}>
              <span className="phrase-question">
                Quem realiza? <span>· sujeito</span>
              </span>
              <span className="lexeme">nde</span>
              <span className="phrase-gloss">2ª pessoa do singular</span>
              <span className="phrase-footer">
                {analysis.hiddenSubject ? (
                  <>
                    <EyeOff size={13} /> Subentendido
                  </>
                ) : (
                  <>
                    <Users size={13} /> Expresso na frase
                  </>
                )}
              </span>
            </button>
            <button {...control('predicate', 'phrase-card predicate-card')}>
              <span className="phrase-question">
                O que acontece? <span>· predicado</span>
              </span>
              <span className="lexeme">apiti</span>
              <span className="phrase-gloss">matar · verbo transitivo</span>
              <span className="phrase-footer">
                <span className="node-dot" /> Núcleo da oração
              </span>
            </button>
            <button {...control('object', 'phrase-card object-card')}>
              <span className="phrase-question">
                Quem sofre? <span>· objeto</span>
              </span>
              <span className="lexeme">moro</span>
              <span className="phrase-gloss">objeto humano genérico</span>
              <span className="phrase-footer">
                {result?.morphemes
                  .filter((m) => m.nodeId === 'object')
                  .map((m) => m.text)
                  .join('') || 'Realização no verbo'}
              </span>
            </button>
          </div>
        </div>
      </div>
      <div className="operation-fields">
        <label className="operation-row">
          <span>
            <strong>Negar a oração inteira</strong>
            <small>A negação envolve a predicação e o modo.</small>
          </span>
          <input
            type="checkbox"
            aria-label="Negar a oração inteira"
            checked={analysis.negated}
            disabled={disabled}
            onChange={(e) => edit({ analysis: { ...analysis, negated: e.target.checked } })}
          />
        </label>
        <label className="operation-row">
          <span>
            <strong>Participante subentendido</strong>
            <small>O sujeito permanece na análise, sem forma independente.</small>
          </span>
          <input
            type="checkbox"
            aria-label="Participante subentendido"
            checked={analysis.hiddenSubject}
            disabled={disabled}
            onChange={(e) => edit({ analysis: { ...analysis, hiddenSubject: e.target.checked } })}
          />
        </label>
        <label className="operation-row">
          <span>
            <strong>Modo da oração</strong>
            <small>Escolha uma realização explícita para esta construção.</small>
          </span>
          <select
            aria-label="Modo da oração"
            value={analysis.mood}
            disabled={disabled}
            onChange={(e) =>
              edit({
                analysis: { ...analysis, mood: e.target.value as 'imperative' | 'indicative' },
              })
            }
          >
            <option value="imperative">Imperativo</option>
            <option value="indicative">Indicativo</option>
          </select>
        </label>
      </div>
      <div className="teaching-note">
        <CircleHelp size={18} />
        <div>
          <strong>Uma mesma forma pode ter análises diferentes.</strong>
          <p>
            Confira participantes e escopo, além do resultado gerado. Uma comparação exata não
            estabelece aprovação editorial.
          </p>
        </div>
      </div>
    </div>
  );
}

export function SelectionNote({ studio, selected }: { studio: Studio; selected: string }) {
  const morphs = studio.result?.morphemes.filter((m) => m.nodeId === selected) ?? [];
  const explanations: Record<string, string> = {
    clause:
      'O sujeito, o predicado e o objeto formam a oração. A negação externa mantém seu escopo visível.',
    subject:
      'O participante de segunda pessoa permanece identificado mesmo quando sua forma independente é omitida.',
    predicate:
      'O predicado apiti seleciona os participantes desta oração. Sua realização pertence ao motor Pydicate.',
    object:
      'moro identifica um objeto humano genérico. Selecione seus morfemas para acompanhar a contribuição na forma gerada.',
    mood: 'O modo é uma propriedade da oração. A escolha visual mantém a chamada correspondente na expressão.',
    negation:
      'A negação é aplicada à oração inteira. Alterar seu escopo exigiria uma construção diferente.',
  };
  return (
    <aside className="selection-note">
      <div className="selection-label">
        <WandSparkles size={15} />
        <span>PARTE SELECIONADA</span>
      </div>
      <div className="selection-body">
        <div>
          <strong>{nodeLabels[selected] ?? selected}</strong>
          <p>{explanations[selected]}</p>
        </div>
        {morphs.length > 0 && (
          <div className="selection-realization">
            <small>NA FORMA GERADA</small>
            <span lang="tpw">{morphs.map((m) => m.text).join(' … ')}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
