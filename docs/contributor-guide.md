# Contribuir com o Pydicate Studio

O Studio reúne a leitura do Catecismo de Araújo, o dicionário local, a árvore Pydicate e propostas de IA. O texto que você prepara, a proposta da IA, a publicação na fonte e a aprovação como ground truth são decisões separadas.

## Abrir o aplicativo

Esta versão ainda usa a instalação de desenvolvimento. A pasta que contém este repositório deve também conter os clones `oldtupicorpus` e `nhe-enga`. Use Node na versão indicada em `package.json` e o Python indicado em [dependências](design/dependencies.md). Na pasta do Studio:

```sh
npm ci
npm run doctor
npm run build
npm start
```

`npm run desktop` abre o modo de desenvolvimento. `PYDICATE_PROJECT_PARENT` permite escolher outra pasta contendo os dois clones; um projeto já salvo continua sendo restaurado. O diagnóstico compara um **baseline histórico**, portanto alterações posteriores legítimas no corpus podem gerar diferenças. Confira o relatório atual em [cobertura de Araújo](coverage/araujo.md); não restaure arquivos pessoais para silenciar o diagnóstico.

O tema escuro é o padrão. Preferências de tema e disposição dos painéis existentes são mantidas. **Fonte / IA** compartilham o painel de apoio, inicialmente à direita; a árvore permanece no centro. O dicionário e o léxico continuam disponíveis.

## Preparar e enviar uma passagem

1. Escolha uma passagem ou use **Adicionar próxima passagem** para criar um rascunho vazio.
2. Em **Fonte**, preencha **Transcrição diplomática**, mantendo a escrita do documento. **Grafia provável em Navarro** é uma hipótese opcional; significado e restrições ajudam a explicar dúvidas.
3. Se quiser, vincule um PDF e marque uma região própria da passagem. A sombra da região anterior serve apenas para posicionamento. Ela não é evidência da nova passagem.
4. Use **Salvar e analisar**. O Studio espera o salvamento do texto e das regiões antes de criar a análise. Se o salvamento falhar, os campos continuam disponíveis e nenhuma análise é enviada.
5. Acompanhe a proposta em **IA**. Você pode preparar outra passagem enquanto o trabalho continua. A chegada de um resultado não muda sua aba nem seleciona outra passagem.

**Leitura normalizada revisada · @target** continua sendo o campo editorial usado na publicação. Uma grafia provável ou uma coincidência aproximada nunca substitui esse campo automaticamente.

Texto é suficiente para iniciar. **Enviar imagens** inclui pixels dos recortes salvos na próxima solicitação; desmarcado, o modelo recebe texto e localizadores, sem uma imagem do fac-símile. Limites: quatro recortes por análise, cada lado até 1.600 pixels e até 500 kB por recorte. Um modelo que rejeite imagens deixa uma falha visível; uma nova solicitação somente com texto continua possível. OCR não é necessário.

## Trabalhar com propostas

- **Analisar passagem** pesquisa os materiais locais e pode construir alternativas.
- **Interpretar a fonte** funciona antes de existir uma expressão Pydicate.
- **Traduzir análise gerada** exige uma expressão avaliada completa; essa tradução explica a análise e não é uma prova independente de que ela corresponde ao documento.
- **Explicar seleção** usa o constituinte selecionado. O menu de contexto da árvore também pode abrir uma pergunta no painel IA.
- **Questionar / refinar** envia seu comentário com a revisão escolhida. Por exemplo: “este constituinte é o objeto” ou “use a outra acepção”. As alternativas anteriores permanecem salvas.

Use **Inspecionar na árvore** para abrir a proposta diretamente no seu rascunho. A árvore já pode ser editada e revisada, sem uma segunda aceitação. Sua transcrição, tradução e notas são preservadas; **Desfazer** recupera a árvore anterior. A árvore começa na vertical quando não há orientação salva. Reabrir a mesma estrutura preserva sua orientação. Confira os resultados intermediários, morfemas, definições, referências e falhas. Uma parte que funciona continua visível quando outra falha.

As comparações mostram separadamente igualdade exata, igualdade sem espaços/maiúsculas e igualdade também sem diacríticos. A escrita original permanece visível: perder uma distinção de nasalização ou acento não constitui evidência de correção.

**Usar no rascunho** também continua disponível. Ao abrir uma proposta antiga, o Studio avalia sua árvore com a gramática atual no próprio computador. Mudanças no corpus ou no programa não exigem outra análise de IA para reutilizar essa árvore. Se o resultado mudar ou falhar, o editor mostra a avaliação atual para você corrigir e revisar.

Depois de inspecionar, use **Revisar nova passagem** ou **Commit to Ground Truth** no editor. Uma árvore com um único nome é suficiente. Confira e aplique a edição da fonte e do léxico para incluí-la no corpus; confirme a referência como ground truth na revisão. Prévias salvas por versões anteriores ainda oferecem **Usar e revisar proposta** para chegar ao mesmo fluxo.

Em **Fonte → Tradução em português**, escreva sua tradução desde o início ou edite-a depois. Novas propostas completas registram também uma tradução sugerida, na mesma análise. **Usar proposta e tradução** copia ambas para o rascunho; se a expressão já foi aceita, **Usar tradução no rascunho** ou **Substituir minha tradução por esta** copia apenas a sugestão. Sua tradução atual é preservada até essa escolha. Propostas antigas sem tradução não são reenviadas automaticamente.

Depois, use a revisão normal da passagem para conferir e publicar as mudanças na fonte e no léxico. O planejamento existente escolhe ou reutiliza variáveis e preserva as definições. **Commit to Ground Truth**, ao lado de Verificar e Salvar rascunho, abre a aprovação separada da referência. IA e clientes MCP não podem executar essas publicações ou aprovações.

## Fila, interrupções e recuperação

A **Fila** mostra as análises do projeto. **Enviar passagens preparadas em lote** registra entradas independentes. Uma hipótese de uma análise não vira automaticamente contexto factual da seguinte. O contexto anterior utiliza somente referências de superfície preservadas, identificadas como legado; elas não certificam a expressão atual.

Uma análise pode estar na fila, em execução, cancelando, precisar de você, ter proposta pronta, estar pausada, falhar ou ser cancelada. Até três conversas podem trabalhar ao mesmo tempo. Correções na mesma gramática aguardam sua vez para não disputar os mesmos arquivos. A fila, as entradas, as conversas, as versões de propostas e o trabalho já produzido ficam no perfil local.

Fechar a janela mantém o trabalho enquanto o processo do Studio estiver aberto. Encerrar o aplicativo ou suspender o computador pode interromper a conexão. Na próxima abertura, tentativas interrompidas ficam recuperáveis e exigem **Tentar novamente**. Repetir uma solicitação pode consumir uso adicional: o Studio não promete cobrança única quando houve perda de conexão antes da confirmação do provedor. Cancelar impede novo trabalho e mantém as propostas já salvas.

Alterações externas no corpus ou na gramática invalidam o contexto anterior. Atualize/reconcilie o rascunho e envie uma nova entrada; a tentativa anterior fica disponível. Arquivos de estado ilegíveis são preservados para recuperação, sem serem substituídos por salvamento automático. Para suporte, conserve uma cópia da pasta de dados do aplicativo antes de fazer qualquer recuperação manual.

## Configurar IA

Abra a configuração recolhida no painel IA, escolha provedor/modelo/raciocínio e use **Salvar configuração**. **Verificar conexão** consulta disponibilidade/autenticação; não gera uma análise.

- **Codex local** usa o login da ferramenta instalada (`codex login`). Esta integração foi verificada com Codex CLI **0.153.4**. Somente as ferramentas de autoria isoladas do Studio ficam habilitadas durante a análise.
- **Claude API** usa `ANTHROPIC_API_KEY` no ambiente que inicia o aplicativo e, quando necessário, `ANTHROPIC_WORKSPACE_ID`. A chave não vai para o renderer. Login do Claude Code não é usado como autenticação da API.

Os testes rotineiros usam transportes determinísticos e não consomem geração. A verificação atual confirmou a autenticação de modelos Claude e a inicialização de uma sessão Codex, sem geração. Crédito e qualidade linguística de uma execução real continuam exigindo um experimento separado com orçamento explícito.

Os limites padrão são 32 chamadas de ferramentas, 300 segundos e 4.096 tokens de saída. Claude recebe o limite restante por rodada. O app-server instalado do Codex não fornece um teto rígido de tokens por turno; o Studio cancela por tempo, chamadas e uso observado. Isso não equivale a um teto exato de cobrança.

Para clientes externos e exemplos de ferramentas, consulte o [guia MCP](design/mcp-agent-guide.md). Para avaliar resultados sem confundir reprodução de uma resposta com descoberta autônoma, consulte o [conjunto de avaliação](evaluation/README.md).

## Conversas e histórico

O seletor **Conversa de IA** alterna entre conversas da passagem, inclusive aquelas ainda em andamento. Suas mensagens e resultados permanecem na conversa de origem.

**Nova conversa** começa uma conversa sem as mensagens anteriores no contexto da IA. A passagem, o rascunho e a evidência continuam disponíveis. As tentativas anteriores ficam em **Histórico**; nada é apagado e nenhuma análise é enviada automaticamente. Se uma análise anterior ainda estiver rodando, seu resultado permanece naquela conversa.

O painel mostra a troca mais recente. Use **Histórico** para consultar respostas anteriores e **Voltar à conversa atual** para continuar. **Entrada salva e atividade** mostra a entrada e um resumo legível das ferramentas consultadas; **Registro técnico** conserva os eventos completos para diagnóstico.


## Corrigir uma forma gerada

Use **Corrigir gramática / árvore** abaixo do resultado atual. **Como deveria ficar?** já contém essa forma: edite somente o que está diferente. Em **O que precisa mudar?**, descreva a diferença com suas próprias palavras. Escolha **Corrigir a gramática local** ou **Completar ou ajustar a árvore** e envie.

Uma correção da gramática abre sua própria conversa com Codex em **IA**. O Studio usa a pasta `nhe-enga` do projeto aberto, registra as formas anteriores e permite alterações verificadas apenas nos arquivos da gramática. Após cada edição, recarrega o motor, avalia a mesma expressão e compara as outras passagens. A conversa mostra o resultado, as formas afetadas e as alterações. Escreva mais orientações nessa conversa para continuar; não é necessário copiar um prompt, usar o terminal ou atualizar o motor manualmente. Uma coincidência não aprova a fonte nem o ground truth.

**Detalhes e diagnóstico** conserva a cópia/exportação do prompt e as verificações manuais. Os testes do aplicativo usam respostas simuladas; a correção efetiva começa somente ao enviar sua solicitação.

## Definir o significado de uma composição

Clique com o botão direito no nó que representa o conjunto e escolha **Definir significado do conjunto…**. Informe o significado do conjunto. A opção de reutilizar as definições das peças restaura entradas equivalentes do léxico ou uma acepção inequívoca do dicionário, conservando a gramática. **Usar definição no rascunho** prepara a composição; **Revisar nova passagem** mostra as entradas que serão publicadas.

Por exemplo, `abaré` conserva “padre…” e `nhemoabare` recebe a composição completa e “sacramento da ordem”. Depois de publicada, a definição da entrada composta pode ser editada no Léxico sem alterar `abaré`.

Toda revisão para publicar uma edição, nova passagem ou mudança lexical executa a regressão do corpus em uma cópia temporária. Novas falhas e mudanças nas passagens preservadas bloqueiam a publicação. O diálogo mostra quantas passagens e referências foram conferidas; problemas anteriores e referências de passagens intencionalmente editadas aparecem separadamente. A avaliação durante a digitação continua automática. Esses controles não usam IA e não aprovam ground truth.


Rascunhos antigos que colocaram uma definição inequívoca do composto em uma peça podem ser corrigidos ao abrir a revisão normal. **Significado do conjunto corrigido** explica a mudança e as entradas mostram os dois sentidos separados. Não é preciso repetir a definição na árvore nesse caso. Feche uma revisão já aberta e gere outra para atualizar sua diferença; o rascunho original continua salvo até a publicação escolhida por você.
