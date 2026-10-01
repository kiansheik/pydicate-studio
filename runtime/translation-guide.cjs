// Readable keys for the engine's existing annotations, never a new analysis.
const LABELS = {
  SUBJECT: 'sujeito no escopo deste nó',
  SUBJECT_PREFIX: 'prefixo que marca o sujeito',
  OBJECT:
    'argumento marcado como OBJECT pelo motor; conferir o nó (pode ser possuidor em uma construção nominal)',
  OBJECT_PREFIX: 'prefixo do argumento marcado como OBJECT; conferir o escopo',
  POSSESSIVE_PRONOUN: 'pronome possessivo',
  PRONOUN: 'pronome',
  ROOT: 'raiz lexical; consultar sua definição',
  NOUN: 'nome',
  VERB: 'verbo',
  PROPER_NOUN: 'nome próprio',
  NEGATION_PREFIX: 'marca prefixal de negação',
  NEGATION_SUFFIX: 'marca sufixal de negação',
  NEGATION_PARTICLE: 'partícula negativa',
  IMPERATIVE_PREFIX: 'marca de imperativo',
  SUBSTANTIVE_SUFFIX: 'sufixo nominalizador',
  PLURIFORM_PREFIX: 'prefixo de flexão pluriforme; não é um participante independente',
  POSTPOSITION: 'posposição; consultar a relação na definição',
  CONJUNCTION: 'conjunção',
  '1ps': 'primeira pessoa do singular',
  '2ps': 'segunda pessoa do singular',
  '3p': 'terceira pessoa; o código sozinho não determina o número',
  '1ppi': 'primeira pessoa do plural inclusiva (inclui o interlocutor)',
  '1ppe': 'primeira pessoa do plural exclusiva (exclui o interlocutor)',
  '2pp': 'segunda pessoa do plural',
  refl: 'reflexivo',
  REFLEXIVE: 'reflexivo',
  gen: 'argumento genérico',
  GENERIC: 'genérico',
};

function translationGuide(annotated) {
  const tags = [
    ...new Set([...String(annotated || '').matchAll(/\[([^\[\]]+)\]/gu)].map((match) => match[1])),
  ];
  return {
    scope: 'analysisTarget.evaluation.annotated',
    instruction:
      'Legenda de leitura, não uma nova análise. Tags repetidos não contam participantes. Use a árvore para delimitar cada relação. Códigos sem explicação continuam desconhecidos; não adivinhe. Marcas nominais de passado não implicam passado da oração.',
    annotations: tags.map((tag) => ({
      tag,
      fields: tag.split(':').map((code) => ({ code, meaning: LABELS[code] || null })),
    })),
  };
}

module.exports = { translationGuide };
