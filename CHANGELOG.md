# Histórico de mudanças

As versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/). A versão fica em [`package.json`](package.json); o site publicado acompanha a `main`.

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
