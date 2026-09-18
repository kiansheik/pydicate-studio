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

/** @studio-guide
{"id":"helpers","title":"n(...), v(...) e helpers do corpus","terms":["helper","lambda","função","n()","v()","credo()","pyreramo()","saguera()"],"body":"Helpers dão nome a sequências reutilizáveis de operações. No léxico atual, n(x) chama x.base_nominal(True); saguera(x) reúne pûera * (saba * x); pyreramo(x) reúne amo * (pûera * (pyra * x)); credo(x) envolve o conteúdo em uma construção já preparada. v(nome), definido no motor, cria um verbo da classe adjetival a partir de um nome e preserva informação de pluriformidade compatível. Não substitua automaticamente um helper por outro só porque uma saída parece semelhante.","ui":"Busque o nome do helper, inspecione sua assinatura e preencha seus argumentos com as peças desejadas. A referência de implementação mostra a definição extraída do código. Um helper preservado no código não implica que todas as suas etapas internas possam ser editadas visualmente.","code":"n(îe * ((smi) * (kuakub / puai)))","api":["n","v","credo","pyreramo","saguera"],"related":["lexico","base_nominal","escopo"]}
*/
/** @studio-guide
{"id":"formacoes","title":"Formações com sara, saba, bae, pyra e emi","terms":["sara","saba","bae","pyra","emi","nominalizador","agente","paciente","deverbal"],"body":"Essas peças representam formações gramaticais e se vinculam à base. No motor, sara e bae estão associados ao agente; pyra e emi ao paciente, com tratamentos diferentes da expressão do agente; saba forma nomes circunstanciais. Essas descrições são um mapa de implementação, não traduções automáticas válidas em todo contexto. Consulte o exemplo completo e os tags DEVERBAL.","ui":"Adicione a peça de formação e a construção-base; vincule no escopo desejado. Observe que a peça não é um sufixo digitado na saída, mas uma operação sobre uma análise.","code":"saba * (asé * (tupan * ekomonhang))","api":["saba_noun_morphology","bae_morphology","pyra_morphology","emi_morphology","sara_morphology"],"related":["helpers","base_nominal","referencia"]}
*/
/** @studio-guide
{"id":"montagem-incompleta","title":"Quando uma etapa ainda não tem forma","terms":["erro","parcial","incompleto","render","IndexError","variante","nominal"],"body":"Uma parte da árvore pode precisar de argumentos ou de uma operação externa antes de se realizar. Isso não demonstra sozinho que a construção final seja inválida. mombeu * nhe e sua variante 1 não têm realização independente no motor atual; a base nominal final da lição 4 é avaliável. Escolher uma variante ou converter para nome faz uma afirmação gramatical: produzir qualquer saída não basta para autorizar essa mudança.","ui":"Continue a montagem e confira as partes já avaliáveis. A dica da lição explica as etapas incompletas conhecidas. Para erros inesperados, preserve a tentativa e registre a forma pretendida em Corrigir gramática / árvore no editor principal.","code":"(mombeu * nhe).var(1).base_nominal()","related":["var","base_nominal","referencia"]}
*/

/** @studio-guide
{"id":"vincular","title":"Vincular elementos e preencher argumentos","terms":["*","posse","sujeito","objeto","argumento"],"body":"Pydicate representa construções, não uma lista de palavras. O operador * vincula elementos conforme seus tipos. Entre nomes pode formar posse; com um verbo pode preencher um argumento. Não deduza sujeito e objeto só pela ordem: confira SUBJECT e OBJECT nas anotações. Parênteses determinam quais elementos formam um conjunto.","ui":"Adicione as peças pela busca. Use o conector de uma peça e escolha o destino; confira os lados em Combinar peças e selecione Vincular elementos. Selecione a ligação para operar sobre o conjunto.","code":"arobiar * espirito_santo\nnde * reino","api":["__mul__"],"related":["escopo","lexico"]}
*/
/** @studio-guide
{"id":"adjuntar","title":"Adjuntar ou coordenar: + entre duas peças","terms":["+","adjunto","coordenação"],"body":"O + entre duas construções acrescenta um adjunto ou coordena elementos, dependendo dos tipos. Não é uma concatenação de texto, e a ordem final depende da construção. O + antes de uma única peça tem outro papel: omissão na fala.","ui":"Conecte os dois conjuntos e selecione Adjuntar ou coordenar. Confira o conjunto à esquerda e o conjunto à direita antes de combinar.","code":"(ianonde * (asé * eo)) + ((nhandy / karaiba) * îar).var(1).base_nominal()","api":["__add__"],"related":["omissao","posposicao"]}
*/
/** @studio-guide
{"id":"composicao","title":"Composição lexical: /","terms":["/","compor","composto","base","modificador"],"body":"A composição combina uma base à esquerda com um modificador à direita. Ela constrói uma unidade lexical, em vez de preencher um argumento verbal. Não é equivalente a * nem a juntar duas grafias manualmente.","ui":"Em Combinar peças, escolha Composição lexical. Para registrar um significado do conjunto, use Definir significado do conjunto e revise a publicação no léxico.","code":"nhandy / karaiba","api":["__truediv__","compose"],"related":["vincular","lexico"]}
*/
/** @studio-guide
{"id":"posposicao","title":"Complementos de posposições","terms":["posposição","complemento","ianonde","pe","pupé"],"body":"Uma posposição relaciona seu complemento à construção. O complemento pode ser um conjunto nominal inteiro. Neste exemplo, ianonde recebe asé * eo; a realização não copia necessariamente a ordem do código.","ui":"Forme primeiro o conjunto nominal. Conecte-o à posposição com Vincular elementos, preservando os lados mostrados no exemplo.","code":"ianonde * (asé * eo)","api":["__mul__"],"related":["vincular","escopo"]}
*/
/** @studio-guide
{"id":"dependencia","title":"Ligar construções dependentes: << e >>","terms":["<<",">>","subordinação","dependência","temporal"],"body":"Esses operadores conservam uma construção principal e ligam outra construção antes ou depois dela. Entre verbos, o motor trata a dependência; um elemento não verbal pode ser adjunto. O modo realizado depende dos verbos, dos participantes e do contexto, não apenas do símbolo.","ui":"Selecione o conjunto inteiro e escolha Dependência à direita ou Dependência à esquerda. Confira a construção principal e as anotações antes de interpretar a relação.","code":"(îub * oré) >> (îekyî * oré)","api":["__lshift__","__rshift__"],"related":["escopo","referencia"]}
*/
/** @studio-guide
{"id":"identidade","title":"Cópula e identidade","terms":["@","==","!=","cop","cópula","identidade"],"body":"@, == e != são operações gramaticais sobre os tipos compatíveis, não os testes comuns de Python neste contexto. Entre nomes e cópulas podem construir predicações de identidade; != nega a relação. Consulte a implementação do tipo ao usar outros predicados.","ui":"Escolha Predicação com cópula, Relação de identidade ou Negar identidade ao combinar as peças. Uma cópula também pode ser criada pelo catálogo de predicados.","code":"tupan == (oré * îara.voc())","api":["__matmul__","__eq__","__ne__"],"related":["vincular","escopo"]}
*/
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

/** @studio-guide
{"id":"var","title":".var(): selecionar uma variante","terms":["var","variante","variation_id","número"],"body":".var(1) seleciona uma variante da construção. O número não significa pessoa, tempo verbal nem uma transformação universal. Predicate.var copia o predicado e define variation_id; subclasses podem restringir os valores e mudar a realização. Por exemplo, verbos com objeto incorporado distinguem variantes 0 e 1. Consulte o tipo efetivamente avaliado.","ui":"Selecione a ligação do conjunto, abra Adicionar operação e escolha Variante. Informe 1; depois, clique no número exibido na operação para alterá-lo. Enter ou sair do campo confirma; Escape cancela.","code":"(mombeu * nhe).var(1)","api":["var"],"related":["base_nominal","escopo"]}
*/
/** @studio-guide
{"id":"base_nominal","title":".base_nominal(): obter a base nominal","terms":["base_nominal","base nominal","nominalização","nome","annotated"],"body":"Obtém uma construção nominal a partir do elemento, conforme seu tipo. Não é simplesmente retirar letras da saída. No exemplo, a variante é escolhida antes de obter a base nominal. O parâmetro annotated controla anotações na realização interna; não seleciona uma variante. As implementações variam conforme o tipo e não são intercambiáveis.","ui":"Selecione o conjunto correto e adicione Base nominal sem argumentos. A árvore deve mostrar a operação envolvendo o resultado de Variante, não apenas a palavra nhe.","code":"(mombeu * nhe).var(1).base_nominal()","api":["base_nominal"],"related":["var","escopo"]}
*/
/** @studio-guide
{"id":"imp","title":".imp(): imperativo","terms":["imp","imperativo","ordem","proibição"],"body":"Marca a construção verbal como imperativa. Os participantes continuam na estrutura e orientam a flexão. Na proibição do exemplo, a negação envolve o conjunto imperativo; o motor realiza a partícula negativa.","ui":"Selecione o conjunto verbal, abra Adicionar operação e escolha Imperativo. Para a proibição, aplique Negação ao resultado inteiro.","code":"-(+nde * mondarõ).imp()","api":["imp"],"related":["omissao","negacao"]}
*/
/** @studio-guide
{"id":"perm","title":".perm(): permissivo","terms":["perm","permissivo","modo"],"body":"Marca o modo permissivo na construção verbal. No exemplo concluído, ur tem como sujeito o conjunto nde * reino; o motor realiza tour nde Reino.","ui":"Selecione o conjunto verbal e escolha Permissivo em Adicionar operação, sem argumentos.","code":"(ur * (nde * reino)).perm()","api":["perm"],"related":["vincular","escopo"]}
*/
/** @studio-guide
{"id":"circ","title":".circ(): modo circunstancial","terms":["circ","circunstancial","indicativo","True","False"],"body":".circ() ativa explicitamente o modo circunstancial. .circ(False) força o indicativo na implementação atual. Use as anotações e o contexto da construção para conferir a escolha; não escolha um modo apenas para aproximar a grafia.","ui":"Selecione o conjunto verbal e escolha Modo circunstancial em Adicionar operação. O argumento booleano pode ser conferido e alterado no código.","code":"(+oré * sapukai.redup()).circ(False)","api":["circ"],"related":["redup","referencia"]}
*/
/** @studio-guide
{"id":"voc","title":".voc(): vocativo","terms":["voc","vocativo","chamamento"],"body":"Forma o vocativo de um elemento nominal compatível. Se o chamamento é um conjunto, aplique a operação ao conjunto inteiro.","ui":"Selecione o nome ou a ligação nominal e escolha Vocativo em Adicionar operação.","code":"(oré * tuba).voc()","api":["voc"],"related":["escopo"]}
*/
/** @studio-guide
{"id":"redup","title":".redup(): reduplicação","terms":["redup","reduplicação","reduplicar"],"body":"Marca a forma reduplicada do verbo. O motor realiza a formação; não copie manualmente uma sequência de letras na palavra de saída.","ui":"Selecione o verbo ou conjunto compatível e escolha Reduplicação em Adicionar operação.","code":"sapukai.redup()","api":["redup"],"related":["circ"]}
*/
/** @studio-guide
{"id":"omissao","title":"+ antes de uma peça: omissão na fala","terms":["+","unário","omissão","pro_drop","pronome","sujeito oculto"],"body":"+nde mantém o pronome e sua informação gramatical na análise, mas marca a omissão de sua expressão independente. Não equivale a remover o nó. Aplicado a um verbo, o operador atua sobre seu primeiro argumento na implementação atual. O + entre duas peças tem outra função.","ui":"Selecione o pronome e escolha Omissão na fala em Adicionar operação. A operação deve envolver somente a peça desejada.","code":"+nde * mondarõ","api":["__pos__"],"related":["adjuntar","escopo"]}
*/
/** @studio-guide
{"id":"negacao","title":"- antes da construção: negação","terms":["-","negar","negação","umẽ"],"body":"O operador unário - alterna a negação da construção. A realização depende da categoria e do modo. Negue a análise no escopo desejado, não a sequência de letras já realizada.","ui":"Selecione a ligação do conjunto e escolha Negação em Adicionar operação. Confira quais ramos ficaram dentro da operação.","code":"-(+nde * mondarõ).imp()","api":["__neg__"],"related":["imp","escopo"]}
*/
/** @studio-guide
{"id":"outros-metodos","title":"Pessoa, numerais e cópias","terms":["inflection","card","ord","copy","compose","pessoa","numeral"],"body":".inflection() consulta a pessoa gramatical; tipos nominais compatíveis podem receber um argumento para defini-la. .card() solicita a forma cardinal. .ord() só funciona quando o tipo oferece uma implementação. .copy() copia a construção. .compose(...) compõe uma base com um modificador. Um nome no catálogo do editor não garante suporte em todos os tipos.","ui":"Confira o tipo e os métodos da peça. Use Adicionar operação para os métodos disponíveis e o código para argumentos que não tenham controle visual específico.","code":"sete.card()","api":["inflection","card","ord","copy","compose"],"related":["composicao","lexico"]}
*/
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
    if (name === 'studio_define')
      return {
        label: 'Significado do conjunto',
        description:
          'Define o significado desta composição sem alterar os sentidos das suas peças. A revisão registra o conjunto no léxico.',
        syntax: 'studio_define()',
      };
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
