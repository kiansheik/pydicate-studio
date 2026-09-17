export interface OperationTermInput {
  kind: string;
  operator?: string;
  method?: string;
  label?: string;
  runtimeType?: string;
  dispatch?: string;
  operandTypes?: string[];
}

export interface OperationTerm {
  label: string;
  description: string;
  syntax: string;
}

const binary: Record<string, Omit<OperationTerm, 'syntax'>> = {
  '*': {
    label: 'Vincular elementos',
    description:
      'Liga os dois elementos. Conforme seus tipos, o vínculo pode preencher um argumento, marcar posse ou aplicar uma formação. A ordem dos lados importa; sujeito e objeto vêm da análise do motor.',
  },
  '+': {
    label: 'Adjuntar ou coordenar',
    description:
      'Acrescenta um elemento como adjunto ou coordena termos nominais, conforme seus tipos. A ordem de realização é determinada pela construção.',
  },
  '/': {
    label: 'Composição lexical',
    description:
      'Combina a base à esquerda com o modificador à direita para formar uma composição lexical.',
  },
  '@': {
    label: 'Predicação com cópula',
    description:
      'Relaciona termos em uma predicação com cópula nos tipos compatíveis. Com verbos, o motor usa suas bases nominais.',
  },
  '==': {
    label: 'Relação de identidade',
    description:
      'Entre nomes e cópulas, constrói uma predicação de identidade. Para outros predicados, a relação depende da implementação do motor.',
  },
  '!=': {
    label: 'Negar identidade',
    description:
      'Nega a relação de identidade, formando uma predicação negativa nos predicados compatíveis.',
  },
  '<<': {
    label: 'Dependência à direita',
    description:
      'Mantém a construção principal à esquerda e liga o elemento da direita depois dela. Entre verbos, cria subordinação; um elemento não verbal pode ser um adjunto.',
  },
  '>>': {
    label: 'Dependência à esquerda',
    description:
      'Mantém a construção principal à direita e liga o elemento da esquerda antes dela. Entre verbos, cria subordinação; um elemento não verbal pode ser um adjunto.',
  },
};

const methods: Record<string, Omit<OperationTerm, 'syntax'>> = {
  imp: {
    label: 'Imperativo',
    description: 'Coloca o verbo no modo imperativo.',
  },
  perm: {
    label: 'Permissivo',
    description: 'Coloca o verbo no modo permissivo.',
  },
  voc: {
    label: 'Vocativo',
    description: 'Forma o vocativo do elemento nominal.',
  },
  circ: {
    label: 'Modo circunstancial',
    description:
      'Ativa o modo circunstancial. Sem argumento, equivale a True; False força o indicativo.',
  },
  var: {
    label: 'Variante',
    description:
      'Seleciona a variante indicada pelo número. As variantes disponíveis dependem do elemento.',
  },
  redup: {
    label: 'Reduplicação',
    description: 'Marca o verbo para realizar sua forma reduplicada.',
  },
  base_nominal: {
    label: 'Base nominal',
    description: 'Obtém a base nominal da construção, conforme o tipo do elemento.',
  },
  card: {
    label: 'Numeral cardinal',
    description: 'Realiza o numeral como cardinal.',
  },
  ord: {
    label: 'Numeral ordinal',
    description: 'Solicita a forma ordinal. O motor precisa oferecer este método para aplicá-lo.',
  },
  inflection: {
    label: 'Pessoa gramatical',
    description:
      'Consulta a pessoa e o número gramaticais. Nos elementos nominais compatíveis, um argumento permite definir essa flexão.',
  },
  compose: {
    label: 'Composição lexical',
    description:
      'Compõe esta base com o modificador informado, como a operação de composição lexical.',
  },
  copy: {
    label: 'Cópia da construção',
    description: 'Cria uma cópia da construção, preservando sua estrutura.',
  },
};

/** Labels describe the inspected Pydicate implementations, not Python's
 * arithmetic meaning. A runtime result alone cannot establish argument roles:
 * overloaded operations specialize only with matching implementation evidence.
 * See docs/design/operation-terms.md for the inspected source and limits. */
export function operationTerm(input: OperationTermInput): OperationTerm {
  const { kind, operator, method, label, runtimeType, dispatch = '', operandTypes = [] } = input;
  const implementation = (owner: string, name: string) => dispatch.endsWith(`.${owner}.${name}`);
  if (kind === 'unary') {
    if (operator === '-')
      return {
        label: 'Negação',
        description: 'Alterna a negação da construção.',
        syntax: '−',
      };
    if (operator === '+')
      return {
        label: 'Omissão na fala',
        description:
          'Marca um elemento como não expresso, mantendo-o na estrutura. Em um verbo, a marca recai sobre seu primeiro argumento.',
        syntax: '+',
      };
  }
  if ((kind === 'binary' || kind === 'comparison') && operator) {
    const term = {
      ...(binary[operator] ?? {
        label: 'Relação',
        description: 'Relaciona os elementos conforme a operação indicada.',
      }),
      syntax: operator,
    };
    if (operator === '*') {
      if (implementation('Noun', '__mul__') && operandTypes.join(',') === 'Noun,Noun')
        return {
          label: 'Posse nominal',
          description: 'O nome à esquerda é o possuidor; o nome à direita é o possuído.',
          syntax: operator,
        };
      if (implementation('Postposition', '__mul__'))
        return {
          label: 'Complemento de posposição',
          description: 'O elemento da direita preenche o complemento da posposição à esquerda.',
          syntax: operator,
        };
      if (implementation('Verb', '__mul__'))
        return {
          label: 'Argumento verbal',
          description:
            'Acrescenta o elemento da direita aos argumentos do verbo à esquerda. Sujeito e objeto dependem da valência e dos argumentos já presentes.',
          syntax: operator,
        };
    }
    if (
      operator === '+' &&
      implementation('Noun', '__add__') &&
      runtimeType === 'Conjunction' &&
      operandTypes.join(',') === 'Noun,Noun'
    )
      return {
        label: 'Coordenação nominal',
        description: 'Reúne os dois nomes em uma construção coordenada, na ordem indicada.',
        syntax: operator,
      };
    if (
      operator === '==' &&
      (implementation('Noun', '__eq__') || implementation('Copula', '__eq__'))
    )
      return {
        label: 'Predicação com cópula',
        description: 'Reúne os termos em uma predicação de identidade com cópula.',
        syntax: operator,
      };
    return term;
  }
  if (kind === 'method') {
    const name = method ?? label?.replace(/^\./, '').replace(/\(.*$/, '') ?? '';
    return {
      ...(methods[name] ?? {
        label: name ? `Transformação: ${name}` : 'Transformação',
        description: 'Aplica o método indicado à base selecionada, com os argumentos informados.',
      }),
      syntax: `.${name}()`,
    };
  }
  if (kind === 'call') {
    const name = method ?? label?.replace(/\(.*$/, '') ?? '';
    return {
      label: name ? `Construção: ${name}` : 'Construção reutilizada',
      description:
        'Aplica a construção definida no projeto aos argumentos indicados. Sua definição determina o efeito linguístico.',
      syntax: `${name}()`,
    };
  }
  return {
    label: label ?? 'Elemento',
    description: 'Elemento preservado da expressão.',
    syntax: operator ?? method ?? '',
  };
}

/** Stable authoring-menu keys are separate from contributor-facing wording. */
export function treeOperationTerm(operation: string): OperationTerm {
  if (operation === 'negate' || operation === 'hidden')
    return operationTerm({ kind: 'unary', operator: operation === 'negate' ? '-' : '+' });
  return operation in binary
    ? operationTerm({ kind: 'binary', operator: operation })
    : operationTerm({ kind: 'method', method: operation });
}
