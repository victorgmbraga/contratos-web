# Histórico de mudanças

As versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/). A versão fica em [`package.json`](package.json); o site publicado acompanha a `main`.

## 2.9.0 — 2026-11-06

### Qualidade

- Verificação semanal do contrato com o PNCP real (`pncp-contract.yml`): busca e colunas padrão dos três tipos, um filtro de cada tipo, status temporal, operadores de busca, busca com 1.000 caracteres, buscas prontas abaixo da janela de 10.000 resultados, listas e catálogos, sugestões e detalhes de documentos de referência. Uma mudança na API abre (ou atualiza) uma issue; falta de resposta do PNCP só gera aviso.
- Testes esperam condições com prazo em tempo, e não um número fixo de rodadas do laço de eventos ou pausas fixas antes de medir, para não falhar de forma intermitente sob carga.

### Desempenho

- JavaScript total de 80,06 para 74,83 KiB com gzip: as buscas prontas passam a um arquivo baixado ao abrir o painel, e o build remove do bundle as descrições do catálogo de argumentos do PNCP, que só documentam o repositório.

### Integração contínua

- `actions/cache` atualizado para a v6.1.0 (Node 24); todas as actions em versões exatas.
- Auditoria das dependências de execução no CI (a aplicação publicada não tem nenhuma); o Dependabot já existente segue propondo as demais atualizações.

## 2.8.1 — 2026-11-05

### Filtros

- O resumo de filtros aplicados mostra o nome da opção também nos filtros de escolha única com lista de opções: **Tipo de item** (Material ou Serviço, em vez de M ou S) e **Tipo de margem de preferência**.

### Integração contínua

- A instalação do navegador no CI separa as dependências do sistema (apt, com retentativas e tempo limite) do download do navegador (com limite e três tentativas). Antes, o limite de tempo interrompia o `npx`, mas deixava o `apt-get` rodando com o bloqueio do dpkg, e as tentativas seguintes falhavam na hora.
- O cache dos navegadores usa a revisão definida pelo Playwright em vez do `package-lock.json`, que muda a cada versão do app e fazia o cache quase nunca ser reaproveitado.

## 2.8.0 — 2026-11-05

### Busca

- **Buscas prontas**, no painel do botão de marcador ao fim do campo de busca: Microsoft, Oracle, Adobe, Symantec e Broadcom, antivírus e proteção de endpoints, Graebert e CAD, MongoDB e NoSQL, desenvolvimento de software e infraestrutura/service desk. São as pesquisas dos scripts de extração do PNCP, em editais de serviço divulgados com itens em andamento ou homologados (as duas últimas também na esfera federal e em pregão eletrônico). Escolher uma aplica os termos com `OR` e os filtros e pesquisa.
- **Minhas buscas**: salve a busca atual com um nome neste navegador (até 30), use-a depois com um clique ou remova-a.
- A busca textual passa a aceitar até 1.000 caracteres (antes, 128), para listas de termos com `OR`. O PNCP aceita consultas desse tamanho.
- As dicas de busca ficam numa seção recolhível do mesmo painel.

### Desempenho

- Limites do orçamento de JavaScript: aplicação de 47 para 50 KiB e total de 78 para 82 KiB com gzip, por causa das listas de termos das buscas prontas.

## 2.7.1 — 2026-11-05

### Busca

- As dicas de busca ganharam a seção recolhível **Onde a busca procura**, com os campos que o PNCP informa pesquisar nas contratações: números de controle e da contratação, objeto e informação complementar, órgão e unidade (inclusive sub-rogados), itens, GTIN, NCM/NBS, patrimônio ou registro imobiliário, fornecedores e ano. O guia de uso traz a mesma lista.

## 2.7.0 — 2026-11-05

### Busca

- Botão **Dicas de busca** (?) no fim do campo de busca, com os operadores que o PNCP aceita: `OR` em maiúsculas para qualquer termo (`microsoft OR o365 OR office`), `NOT` para excluir e aspas para frase exata. Cada exemplo preenche a busca. O painel avisa que o PNCP procura o texto também na descrição dos itens, e o guia de uso ganhou a seção **Combinar termos**.

## 2.6.1 — 2026-11-05

### Testes

- Os testes de navegador rodam em processos separados, até três ao mesmo tempo, e o roteiro de interface foi dividido em três partes (`ui-smoke-1/2/3.mjs`) com as mesmas verificações. A suíte local passou de cerca de 2 min para cerca de 55 s; `--serial` mantém a execução de um arquivo por vez.
- No CI, os navegadores do Playwright ficam em cache e a instalação tem limite de tempo com até três tentativas, evitando os travamentos no download.

## 2.6.0 — 2026-11-05

### Filtros

- **Município** e **Município do fornecedor** passam a usar a relação oficial do IBGE (5.571 municípios), carregada só quando o campo é usado: ao abrir, mostram as capitais ou os municípios das UFs escolhidas, e a busca funciona desde a primeira letra, sem acentos e aceitando a UF no termo. Os nomes aparecem como `Município/UF`, inclusive em links compartilhados, sem consultar o PNCP. Se a relação não carregar, os campos voltam às sugestões do PNCP.
- Órgão, unidade, fornecedor, fonte/plataforma e os campos sub-rogados, que dependem da busca do PNCP a partir de três caracteres, mostram antes disso as opções **usadas recentemente** neste navegador (até oito por campo).
- As orientações dentro das listas de opções ("Digite ao menos 3 caracteres…", "Consultando opções…") passam a ser anunciadas por uma região de status fora da lista, corrigindo uma violação de acessibilidade (`aria-required-children`).

## 2.5.4 — 2026-11-05

### Filtros

- O espaçamento vertical do modal de filtros fica uniforme: campos de data, texto, lista e seleção múltipla têm a mesma altura, e áreas vazias (opções escolhidas) e margens extras das listas não aumentam mais algumas linhas.

## 2.5.3 — 2026-11-04

### Filtros

- A busca pelo nome do filtro usa o mesmo destaque de foco dos demais campos (borda azul com halo), em vez do contorno genérico afastado do campo.

## 2.5.2 — 2026-11-04

### Filtros

- No celular, campos de data vazios passam a mostrar o formato `dd/mm/aaaa`, como os demais campos mostram seus exemplos.

## 2.5.1 — 2026-11-04

### Filtros

- Os grupos do modal de filtros abrem e fecham com animação de altura e opacidade, e a seta do título gira junto; com movimento reduzido, a transição é desligada.
- As linhas divisórias entre os grupos foram removidas.

## 2.5.0 — 2026-11-04

### Filtros

- Campos de valor monetário usam a máscara de reais (`R$ 1.000,50`); percentuais aceitam só dígitos, vírgula e `%` (`5,25%`); quantidades passam a usar vírgula decimal (`1.500,5`).
- O ponto vale apenas como separador de milhar. O envio à API continua com o decimal com ponto (`1000.50`), e valores restaurados de links voltam ao padrão brasileiro.
- Valores mal formados, como `1000.50`, mostram erro no campo e impedem aplicar os filtros em vez de serem descartados.

### Projeto

- O orçamento de JavaScript total do build passa de 75 KiB para 78 KiB gzip; a `main` já estava em 74,97 KiB. Os limites da aplicação (45 KiB) e do Worker (38 KiB) não mudam.

## 2.4.0 — 2026-11-04

### Pesquisa

- Editais ganham colunas opcionais com os dados que o portal PNCP mostra em cada edital da listagem: **Amparo legal**, **Modo de disputa**, **Registro de preços**, **Fonte orçamentária**, **Fonte/Plataforma**, **Órgão sub-rogado** e **Unidade sub-rogada**. Também entram no CSV de editais.
- Os critérios ativos acima da tabela passam a mostrar datas (`01/10/2026`), valores (`R$ 1.000,50`), percentuais e quantidades no padrão brasileiro.

## 2.3.1 — 2026-11-04

### Detalhes

- UF e Município passam a formar o campo **Localidade da Unidade** (`Município/UF`), como no PNCP, inclusive na unidade sub-rogada e nas partes envolvidas.
- O código IBGE e o nome da UF da unidade deixam de aparecer nos detalhes; o filtro por código IBGE continua na pesquisa.

## 2.3.0 — 2026-11-04

### Pesquisa

- Editais ganham o status **Encerradas** (`encerradas`), como no portal do PNCP; "Propostas encerradas" passa a se chamar **Em julgamento (propostas encerradas)**.
- Filtro de **início do recebimento de propostas** (`data_inicio_vigencia_inicio`/`fim`) habilitado para editais, no grupo **Principais**.
- Colunas opcionais **Início das propostas** e **Fim das propostas** (data e hora) em editais, também incluídas no CSV.

### Testes

- IDs de teste duplicados renomeados (`BROWSER-30/31`, `FILTERS-UI-23/24`).

## 2.2.2 — 2026-11-04

### Interface

- **Filtros** e **Exportar** voltam a exibir somente o ícone, com o nome no tooltip, como os demais botões.
- Na aba **Detalhes**, **Controle PNCP**, **Contratação de origem** e **Ata de origem** (quando existirem), **Fonte** e **Processo eletrônico** passam a ser os primeiros campos, em negrito, antes dos campos principais de cada tipo.

## 2.2.1 — 2026-11-04

### Interface

- Remove a linha de resumo e o botão **Abrir no PNCP** acima das abas dos detalhes; os campos principais de cada tipo passam a aparecer primeiro e em negrito na aba **Detalhes**. A página oficial continua acessível pelo link de **Controle PNCP**.

## 2.2.0 — 2026-11-04

### Desempenho

- O Worker começa a carregar em paralelo ao download de `browser-config.json`, e o boot do tema é embutido no HTML (sem requisição extra antes da primeira pintura).
- A pré-carga das opções de filtros e a validação das consultas compartilham o mesmo cache e as requisições em andamento: links com filtros de lista não repetem a consulta de domínios.
- A exportação completa mantém até duas páginas adiantadas, ficando limitada pelo ritmo de chamadas e não pela latência do PNCP.
- Operações além do limite aguardam numa fila do Worker em vez de falhar com `CONCURRENCY_LIMIT`.
- A imagem de compartilhamento passou de 215 KB para 83 KB.

### Interface

- Modal de filtros com o grupo **Principais** e busca pelo nome do filtro.
- Painel de detalhes com resumo dos fatos principais e o botão **Abrir no PNCP**.
- **Filtros** e **Exportar** exibem o rótulo em telas largas.
- Contagens de editais usam "editais", como o seletor de tipo.
- Leitores de tela: tooltips não repetem o nome dos botões; avisos usam regiões vivas sempre presentes e erros são anunciados como alerta.
- O CSV passa a se chamar `contratos-web-<data>.csv`.

### Projeto

- Código formatado com Prettier (120 colunas), conferido no CI.
- Cobertura mínima calculada somente sobre o código de produção.
- Opções adicionais de verificação de tipos (`noUnusedLocals`, `strictFunctionTypes` e outras).
- Nomes legados `compras-*` substituídos por `contratos-web` (pacote e variáveis `CONTRATOS_QA_*` dos testes).
- Documentação: decisões de arquitetura, guia de uso, comportamento da interface separado e guia de contribuição.

## 2.1.0 e anteriores

Consulte o [histórico do Git](https://github.com/victorgmbraga/contratos-web/commits/main).
