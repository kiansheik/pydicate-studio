# Guia rápido de construção

Escolha o que quer montar. Confira a ordem, a categoria e o trecho selecionado; aplique somente depois de revisar a prévia.

No Studio, abra **Guia rápido** no cabeçalho da árvore. O menu de contexto oferece **Obter base nominal**, **Negar esta construção** e **Omitir na fala**; cada ação abre a prévia antes de aplicar. **Ver receita e exemplos** explica a operação escolhida.

Por padrão, a peça arrastada fica à direita (Segunda peça) e o destino à esquerda (Primeira peça). **Inverter ordem das peças** troca os lados antes de combinar. Selecione uma ligação para transformar o conjunto ou uma palavra para transformar só aquela peça.

As saídas abaixo são exemplos de referência conferidos em 2026-10-02 no motor local e no servidor. **Conferir este exemplo no motor atual** usa a avaliação normal do Studio no contexto atual, sem mudar o rascunho ou chamar um provedor de IA. Uma forma gerada não constitui aprovação editorial nem uma tradução automática.

## Preencher um argumento

Use * para vincular construções conforme seus tipos: pode ser argumento verbal, posse nominal ou complemento. Não significa somente objeto direto.

1. Escolha a construção e o argumento.
2. Confira Primeira peça e Segunda peça; a ordem não é a ordem garantida da fala.
3. Observe sujeito/objeto nas anotações e se ainda faltam argumentos.

```python
oré * tuba
```

→ **oré ruba**

```python
abé * ybaka * yby
```

→ **ybaka yby abé**

A valência depende da peça. O verbo pode esperar sujeito e objeto; abé espera pelo menos dois membros. Uma etapa incompleta pode ainda não ter forma.

## Reunir dois ou mais membros com abé

A conjunção abé recebe os membros sucessivamente com *. A variante 1 realiza bé. O bé do léxico também pode ser uma posposição: confira a categoria.

1. Comece com abé.
2. Vincule o primeiro membro com * e depois o segundo.
3. Para mais membros, vincule outra peça ao conjunto.

```python
abé * ybaka * yby * abá
```

→ **ybaka yby abá abé**

```python
abé.var(1) * ybaka * yby
```

→ **ybaka yby bé**

```python
Conjunction("bé") * ybaka * yby
```

→ **ybaka yby bé**

bé escolhido explicitamente como Conjunction, separado da posposição bé.

```python
Postposition("bé") * (ybaka + yby)
```

→ **ybaka yby bé**

A mesma superfície, mas uma posposição com um único complemento coordenado.

Conjunção: 2 ou mais argumentos. Posposição: 1 complemento. Formas iguais não tornam as duas árvores equivalentes.

## Formar uma unidade lexical

A composição / reúne a base à esquerda com o modificador à direita. Confira a forma do composto e o significado do conjunto.

1. Coloque a base como Primeira peça.
2. Coloque o modificador como Segunda peça.
3. Escolha Composição lexical e confira a prévia.

```python
nhandy / karaiba
```

→ **nhandykaraíba**

Compor uma base e preencher um argumento com * são decisões diferentes.

## Acrescentar um advérbio ou adjunto

Com + entre duas peças, a posição e o tipo importam. Um advérbio antes do verbo pode alterar também o modo, e não apenas a ordem das palavras.

1. Monte o verbo com seus argumentos.
2. Combine com o advérbio usando +.
3. Inverta os lados para comparar as duas prévias.

```python
Adverb("marã") + (ikó * ae)
```

→ **marã sekóû**

```python
(ikó * ae) + Adverb("marã")
```

→ **oîkó a'e marã**

Aqui marã é criado explicitamente como Adverb. No léxico inspecionado, marã é Noun (trabalho): confira a categoria e o sentido da peça que você selecionou.

## Ligar mais perto do verbo

Para um adjunto não verbal mais próximo do verbo, use verbo << adjunto depois, ou adjunto >> verbo antes. + reúne adjuntos periféricos. Estas operações também têm outros tratamentos quando ambos são verbos.

1. Monte o verbo e seus argumentos.
2. Escolha o adjunto e confira qual lado deve receber cada peça.
3. Compare a posição do adjunto próximo e dos elementos periféricos na prévia.

```python
(Adverb("kori") + (ikó * ae)) << Adverb("eté")
```

→ **kori sekóû eté**

```python
Adverb("eté") >> ((ikó * ae) + Adverb("kori"))
```

→ **eté sekóû kori**

Neste par, << coloca eté depois do verbo, dentro de kori; >> coloca eté antes do verbo, dentro do kori final. Não troque os sinais sem conferir os lados.

## Montar uma posposição antes de juntá-la

Uma posposição recebe seu complemento com *. Depois, + pode acrescentar outra construção já completa. resé é uma realização da peça esé com este complemento.

1. Monte esé * abá.
2. Monte supé * nde separadamente.
3. Junte as duas construções completas com +.

```python
(esé * abá) + (supé * nde)
```

→ **abá resé endébo**

A receita esquemática (coisa + resé) + supé não preenche esses complementos. Use as peças e a valência reais; conferir uma saída não decide a análise histórica.

## Obter uma base nominal

Base nominal transforma a construção compatível em um nome. Use quando a etapa seguinte precisar de uma base nominal; não é um comando para simplesmente corrigir a grafia.

1. Monte ikó * ae.
2. Selecione o conjunto e escolha Obter base nominal; confira e aplique.
3. Monte esé * abá como peça completa e junte com +.

```python
(ikó * ae).base_nominal() + (esé * abá)
```

→ **sekó abá resé**

```python
((ikó * ae) + (esé * abá)).base_nominal()
```

→ **sekó abá resé**

Neste exemplo, nominalizar depois do PP produz a mesma forma.

```python
n(ikó * ae)
```

→ **sekó**

Helper do léxico, não um novo operador.

Base nominal antes de adicionar o PP é uma sequência clara para construir e conferir cada etapa. Não é uma exigência universal: ordem, categoria e escopo precisam ser testados no caso concreto. No léxico inspecionado, n(...) é um helper para .base_nominal(True); esse argumento conserva a via de realização anotada do motor e pode influir na normalização da grafia. Confira antes de substituir uma chamada por outra.

## Negar uma construção

Negação aplica - ao trecho selecionado. Selecione o conjunto que deve ficar negado; a realização muda conforme a categoria e o modo.

1. Selecione a ligação do conjunto.
2. Escolha Negar esta construção e confira o alcance da operação.
3. Para uma ordem negativa, confira também o modo imperativo.

```python
-(ikó * ae)
```

→ **noîkóî a'e**

```python
-(+nde * mondarõ).imp()
```

→ **emondarõ umẽ**

Negação alterna o estado: aplicar - duas vezes restaura a construção afirmativa. Não é apagar uma palavra da saída.

## Omitir a fala de um pronome

O + antes de uma única peça marca omissão na fala, mantendo a informação na análise. É diferente do + que liga duas peças.

1. Selecione só o pronome.
2. Escolha Omitir na fala.
3. Depois vincule esse pronome ao verbo.

```python
+nde * mondarõ
```

→ **eremondarõ**

O + unário sobre um verbo atua no primeiro argumento. Para escolher o pronome com precisão, faça a operação no próprio pronome.

## Pedir ou ordenar uma ação

Imperativo solicita a realização imperativa do verbo. Os argumentos e a negação continuam fazendo parte da construção.

1. Prepare o verbo e seus argumentos.
2. Selecione o conjunto verbal.
3. Escolha Imperativo e confira a prévia antes de aplicar.

```python
(+nde * mondarõ).imp()
```

→ **emondarõ**

```python
-(+nde * mondarõ).imp()
```

→ **emondarõ umẽ**

Uma prévia com forma não aprova a leitura do documento. Preserve o trecho original e as dúvidas de interpretação.

## Usar o modo permissivo

Permissivo solicita esse modo do verbo selecionado. Não acrescenta manualmente uma partícula à palavra já escrita.

1. Prepare o conjunto verbal.
2. Escolha Permissivo.
3. Confira os argumentos e a realização resultante.

```python
(ikó * ae).perm()
```

→ **toîkó a'e**

Os modos disponíveis dependem da categoria; um nome não vira verbo ao receber esse método.

## Chamar alguém pelo nome

Vocativo atua na construção nominal que nomeia quem é chamado.

1. Monte o nome ou a relação nominal.
2. Selecione o conjunto e escolha Vocativo.
3. Confira a forma de chamamento.

```python
(oré * tuba).voc()
```

→ **oré rub**

Selecione o conjunto nominal inteiro quando o possuidor também fizer parte do chamamento.

## Escolher uma variante existente

Variante escolhe um número definido pelo motor para aquela peça. Não inventa uma variante nem garante uma grafia desejada.

1. Selecione a peça adequada.
2. Escolha Variante e informe o número.
3. Confira a diferença no resultado.

```python
abé.var(1) * ybaka * yby
```

→ **ybaka yby bé**

Aqui a variante 1 da conjunção abé realiza bé. O mesmo número em outra peça pode ter outro efeito ou não alterar a forma.

## Reduplicar um verbo

Reduplicação pede que o motor forme o verbo reduplicado, preservando a estrutura e os argumentos.

1. Selecione o verbo.
2. Escolha Reduplicação.
3. Confira o verbo no conjunto completo.

```python
(nde * supé) + (+oré * sapukai.redup()).circ(False)
```

→ **endébo orosapukapukaî**

Este exemplo do corpus reúne reduplicação e .circ(False), que força o indicativo. Não copie sílabas manualmente na saída.

## Escolher o modo circunstancial ou indicativo

Modo circunstancial sem argumento equivale a True. O argumento False força o indicativo. Um adjunto anteposto pode disparar o circunstancial automaticamente.

1. Selecione o verbo.
2. Em Modo verbal, escolha Indicativo (False) para forçar o indicativo, ou Circunstancial para True.
3. Compare o conjunto com seus adjuntos.

```python
(ikó * ae).circ(False)
```

→ **oîkó a'e**

```python
Adverb("kori") + (ikó * ae).circ(False)
```

→ **kori oîkó a'e**

Com o adjunto antes do verbo, False conserva aqui o indicativo.

Escolher o modo é uma decisão gramatical; não use False só para fazer desaparecer um erro.

## Criar um verbo de 2ª classe

A conversão v(...) parte de uma base nominal compatível. O editor usa a informação do motor para obter a base nominal quando necessário.

1. Selecione a base nominal.
2. Escolha Verbo de 2ª classe (estativo).
3. Confira a categoria e a realização no contexto.

```python
v(angaipaba)
```

→ **angaîpab**

Esta operação conserva a análise; não substitui automaticamente a construção por uma palavra com superfície parecida.

## Documento e análise

Preserve a grafia e as quebras de linha do documento. A análise com peças pode atravessar uma linha sem autorizar sua junção na transcrição.

```text
Oito tecó catú eté rerecoáramo
Oporomöĩgobêbäe.
```

Este guia não estabelece a análise dessas linhas nem de “Abá marã sekoagûerĩ resé nherane’yma.”. Registre as dúvidas junto da leitura.

Fonte das receitas: `src/domain/builder-guide.json`. Para atualizar esta cópia: `python3 -B scripts/build-builder-guide.py`. Para conferir alinhamento: `python3 -B scripts/build-builder-guide.py --check`. As verificações executáveis estão em `python/tests/test_builder_guide.py`; veja o registro da sessão para revisões, hashes, contexto e limites.
