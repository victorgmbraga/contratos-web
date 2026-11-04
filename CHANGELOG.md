# Histórico de mudanças

As versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/). A versão fica em [`package.json`](package.json); o site publicado acompanha a `main`.

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
