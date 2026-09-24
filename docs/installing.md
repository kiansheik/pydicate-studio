# Instalar e atualizar o Pydicate Studio

Baixe o instalador na [página de versões](https://github.com/kiansheik/pydicate-studio/releases/latest). O aplicativo inclui Python e Git; você não precisa instalar essas ferramentas para ler, analisar e editar o corpus.

| Computador                  | Arquivo                             |
| --------------------------- | ----------------------------------- |
| Mac com Apple Silicon       | `.dmg` identificado como `arm64`    |
| Mac com Intel               | `.dmg` identificado como `x64`      |
| Windows de 64 bits          | `.exe` identificado como `x64`      |
| Linux de 64 bits, Intel/AMD | `.AppImage` identificado como `x64` |

No Mac, abra o `.dmg`, copie **Pydicate Studio** para Aplicativos e abra essa cópia. No Windows, execute o instalador; a instalação pertence ao seu usuário.

No Linux, dê permissão de execução ao AppImage e abra-o. Por exemplo, substituindo `VERSAO` pelo número do arquivo baixado:

```sh
chmod +x "Pydicate-Studio-VERSAO-linux-x64.AppImage"
./Pydicate-Studio-VERSAO-linux-x64.AppImage
```

O suporte a FUSE depende da distribuição. Se houver erro de montagem, consulte a [orientação oficial do AppImage](https://docs.appimage.org/user-guide/troubleshooting/fuse.html); a documentação também descreve execução por extração. A atualização automática do Studio requer executar o próprio AppImage.

## Primeira abertura

Clique em **Preparar meu espaço de trabalho**. O Studio baixa o corpus e a gramática para **Documentos/Pydicate Studio** e mostra o progresso. Essa primeira preparação precisa de internet. A pasta usada aparece na tela; o caminho pode variar conforme a configuração de Documentos no sistema.

As cópias locais ficam em `oldtupicorpus` e `nhe-enga`. A gramática, o dicionário e os arquivos necessários para o trabalho são incluídos na preparação. As digitalizações históricas, que ocupam vários gigabytes, ficam fora desse download: vincule seus PDFs na aba **Fonte**. Depois da preparação, **Abrir meu espaço de trabalho** reutiliza as cópias existentes, inclusive sem internet.

Você também pode abrir uma pasta de projeto existente. O Studio só atualiza automaticamente as cópias que ele próprio preparou. Rascunhos e evidências ficam no armazenamento local do aplicativo; as edições aceitas na fonte ficam na pasta do corpus. Instalar uma nova versão do aplicativo não substitui esses dados.

Os recursos de IA são opcionais e têm sua própria autenticação. A integração Codex depende de uma instalação e conta da CLI; a integração Claude usa credenciais da API. Esses serviços e seus custos não estão incluídos no instalador. A análise pelo motor, a edição da árvore e o trabalho com fontes funcionam sem IA. Consulte o [guia do colaborador](contributor-guide.md) para configurar os provedores.

## Atualizações

Ao iniciar, o aplicativo instalado verifica versões publicadas a partir de `main`. Quando a atualização automática está disponível, baixa a nova versão e reinicia antes de abrir o projeto para edição. Sem conexão, ou se a atualização falhar, a versão instalada continua disponível. O estado e o acesso à página de versões aparecem na abertura.

O corpus e a gramática têm atualização separada. O Studio só avança uma cópia gerenciada quando ela está limpa, na branch `main`, sem commits locais. Arquivos editados, commits locais e outras branches são preservados; a tela informa quando a atualização ficou pendente. Projetos abertos de outra pasta não recebem essa atualização automática.

As prévias para Mac sem assinatura **Developer ID** usam atualização manual pela página de versões. A assinatura local usada na compilação não equivale a uma assinatura de desenvolvedor reconhecida pela Apple nem à notarização. O Gatekeeper pode impedir a abertura; consulte as [instruções da Apple para abrir aplicativos baixados](https://support.apple.com/pt-br/102445). A distribuição com Developer ID e notarização depende das credenciais de publicação descritas abaixo.

No Windows, instaladores novos ou sem assinatura podem apresentar aviso de reputação do SmartScreen. Veja a [explicação da Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## Preparar uma versão para distribuição

Esta parte é para quem mantém o aplicativo. Use Node.js 24 e uma máquina da mesma plataforma e arquitetura do instalador. O runtime é preparado nativamente; uma compilação cruzada não deve reutilizar o runtime de outra arquitetura.

```sh
npm ci
npm run runtime:prepare
npm run build:app
npm run dist
```

`dist` repete a preparação do runtime e a compilação e grava os instaladores em `release/`, sem publicá-los. Para obter somente o aplicativo empacotado, use `npm run dist:dir`. O comando `build:app` usa os materiais de aprendizagem já registrados no repositório e não regenera dados do corpus.

`runtime:prepare` baixa CPython com versão e SHA-256 fixados, copia o Git distribuído por `dugite` e produz `build/runtime`. A preparação testa Python, SQLite, SSL, processos Python filhos e Git com o PATH externo vazio. As dependências Python do núcleo são da biblioteca padrão; futuras dependências externas devem ser fixadas com hashes em `requirements-runtime.txt`. O runtime não instala outra cópia da gramática: usa a do projeto aberto.

Para conferir o executável empacotado com um perfil temporário, use `node scripts/smoke-packaged.mjs "CAMINHO_DO_EXECUTAVEL"`. O teste verifica a primeira abertura, Python e Git integrados e as operações pré-compiladas com os downloads de atualização bloqueados. Um terceiro argumento opcional abre uma cópia descartável do projeto e confere uma realização pelo motor. No Linux, a execução automatizada precisa de uma sessão gráfica ou `xvfb-run`.

O workflow [Desktop release](../.github/workflows/release.yml) roda a partir de `main`, em quatro runners nativos. Gera uma versão crescente, compila todos os instaladores, confere os hashes dos arquivos de atualização e só publica a versão após os quatro resultados. A publicação usa o token do GitHub Actions com permissão `contents: write`.

Para assinar versões, configure os secrets do repositório:

| Plataforma                    | Secrets                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| Mac: certificado Developer ID | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`                     |
| Mac: notarização              | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Windows: certificado          | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                     |

O workflow passa os certificados a `CSC_LINK` e `CSC_KEY_PASSWORD`, reconhecidos pelo electron-builder. Para compilações locais, use essas variáveis diretamente. Os detalhes de certificados e notarização seguem a [documentação do electron-builder](https://www.electron.build/docs/features/code-signing/). Não registre certificados, senhas ou tokens no repositório.

Os testes locais não substituem a instalação em cada sistema. Antes de anunciar uma versão, confirme os quatro artefatos publicados e teste instalação, primeira preparação e reabertura com o instalador correspondente.
