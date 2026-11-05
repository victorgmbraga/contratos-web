# Histórico de mudanças

As versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/). A versão fica em [`package.json`](package.json); o site publicado acompanha a `main`.

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
