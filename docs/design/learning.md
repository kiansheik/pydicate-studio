# Aprender e referência gerada

O botão **Aprender** abre a prática sem mudar o rascunho nem a disposição dos painéis. As cinco lições somam uma estimativa de dez minutos; esse tempo ainda precisa ser medido com usuários iniciantes.

| Lição | Minutos | Registro de Araújo | Construções |
| --- | --- | --- | --- |
| Ligar duas peças | 1 | 38 | Reutilização lexical, argumento verbal |
| Construir de dentro para fora | 2 | 5 | Posse, escopo, permissivo |
| Omitir não é apagar | 2 | 69 | Omissão, imperativo, negação |
| Da construção à base nominal | 2 | 85 | Variante, base nominal, etapas parciais |
| Reunir construções maiores | 3 | 86 | Posposição, composição lexical, adjunção |

As lições usam exemplos integrais que têm referência aprovada. Os exemplos de Bettendorff também aparecem na busca da referência. O agrupamento dos registros é por ordinal, usando o parser de fonte existente. Não se confunde o estado privado **Concluídas** com aprovação editorial: a biblioteca é portátil e deriva da fonte e dos registros compartilhados, não do perfil de uma pessoa.

## Onde escrever

- `python/learning_library.py`: comentário de módulo com `@studio-lessons` seguido de uma lista JSON. Cada lição declara fonte, ordinal, etapas, dicas e pergunta de compreensão. A última etapa deve ter exatamente a estrutura da fonte, desconsiderando apenas formatação e parênteses redundantes.
- `src/domain/operation-terms.ts`: verbetes junto às operações do editor.
- `src/components/LearningWorkspace.tsx`: verbetes sobre a interação e o fluxo de revisão.
- Métodos em `nhe-enga/pydicate/pydicate/**/*.py`: uma docstring pode conter `@studio-guide` e o mesmo objeto JSON. Assinaturas e docstrings técnicas já entram automaticamente na seção **Implementação**, sem necessidade de duplicação manual.
- Lambdas nos `.tu.py`: definições de helpers são indexadas automaticamente, com assinatura, código e localização. Todas as expressões das fontes históricas entram na seção **Exemplos**, com operações usadas e comparação de referência.

Exemplo de comentário JSDoc, inserido junto à operação que ele descreve:

```ts
/** @studio-guide
{
  "id": "operacao-estavel",
  "title": "Título em português",
  "terms": ["nome_do_metodo", "termo de busca"],
  "body": "O que a operação afirma e em que contextos é válida.",
  "ui": "Ações concretas no editor e como conferir o escopo.",
  "code": "expressao_do_projeto.metodo()",
  "api": ["nome_do_metodo"],
  "related": ["escopo"]
}
*/
```

Identificadores precisam ser únicos. JSON inválido, campos obrigatórios ausentes e referências de lições sem verbete falham na geração. `api` e `related` são opcionais. A docstring técnica original pode estar em outro idioma; o verbete destinado ao usuário deve ser escrito em português brasileiro. Exemplos explicativos de verbetes não recebem selo de aprovação: esse estado pertence aos registros do corpus.

## Geração e atualização

```sh
npm run docs:build
npm run docs:check
npm run build
npm run test:learning
```

`PYDICATE_PROJECT_PARENT` seleciona a pasta que contém os clones `oldtupicorpus` e `nhe-enga`; por padrão é a pasta-pai do Studio. `scripts/build-learning.py --parent /caminho` aceita seleção explícita. `STUDIO_TEST_PORT` altera a porta dos testes de aprendizagem, cujo padrão é 5197; esses testes não reutilizam um servidor já aberto.

O arquivo `src/generated/learning.json` é uma saída gerada, não um segundo lugar para editar a documentação. O build a regenera obrigatoriamente; `docs:check` compara bytes determinísticos. O navegador sem Electron usa esse registro como consulta e não afirma ter executado o motor local. No desktop, a operação read-only `learning_library` reconstrói o material no projeto selecionado, em processo Python novo, e verifica o fingerprint antes e depois. O cache também acompanha alterações na documentação do Studio. Atualizações de corpus/gramática invalidam o progresso antigo, preservado em chave separada.

Uma lição é desativada quando muda sua estrutura-fonte, quando perde uma referência aprovada, quando o alvo declarado diverge ou quando falha a avaliação final. O build falha nesse caso e exige revisão do comentário da lição; não reescreve a fonte nem a referência para recuperar a coincidência. Etapas parciais intencionais declaram `partialExpected` e precisam de explicação própria. Atualmente isso ocorre antes da base nominal na lição 4.

## Prática e perguntas

O componente usa o editor real `PydicateTree`/`ExpressionCanvas`, os mesmos parsers e o mesmo motor. Tentativa, peças soltas, etapa, resposta e conclusão ficam em armazenamento separado de progresso; os dados de floresta passam pelo validador existente ao restaurar. Modelos exigem confirmação antes de substituir a tentativa, e há desfazer. A conclusão exige mesma estrutura, forma e anotação do exemplo final, avaliação completa e resposta correta à pergunta. Não é uma aprovação linguística de análises alternativas.

**Tenho uma dúvida** oferece verbetes relacionados e uma pergunta explícita ao provedor configurado. O serviço de explicação recebe a expressão da prática e a passagem da lição, nunca o rascunho que ficou por trás do diálogo. Respostas ficam no histórico existente do provedor, filtradas pela lição; cancelar não apaga o histórico. Testes simulam o provedor, sem inferência paga. A nova fila de reconstrução não é usada para perguntas didáticas, que não precisam de transcrição nem de PDF.

## Limites e próxima decisão

- Os rótulos e dicas são didáticos, não substituem revisão filológica. Papéis gramaticais se conferem nas anotações reais do motor.
- Não há mudança automática para uma variante ou base nominal apenas para obter alguma saída. Na consulta MCP atual, `(mombeu * nhe).base_nominal()` realiza `oîo mombe'u`, enquanto a variante 1 realiza `nhemombe'u`; renderizar não resolve sozinho qual análise se pretende.
- Uma futura assistência de montagem pode oferecer alternativas contextualizadas e registrar a operação escolhida. Alteração automática da árvore depende de uma decisão explícita de produto e análise linguística.
- A duração de dez minutos é um orçamento de conteúdo. Usabilidade com falantes e linguistas iniciantes e qualidade das respostas reais da IA não foram avaliadas por testes automatizados.
