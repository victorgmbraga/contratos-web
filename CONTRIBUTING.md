# Como contribuir

Obrigado pelo interesse no Contratos Web. Este guia resume o fluxo de trabalho; os detalhes técnicos estão em [`docs/`](docs/).

## Preparar o ambiente

Requisitos: Node.js 24 (veja [`.nvmrc`](.nvmrc)) e npm.

```sh
npm ci
npm run dev          # http://localhost:8000, consultando o PNCP real
```

Para os testes de navegador, instale o Chromium uma vez com `npx playwright install chromium`.

## Antes de abrir um pull request

Execute as mesmas verificações do CI:

```sh
npm run format:check   # ou npm run format para corrigir
npm run lint
npm run typecheck
npm run test:coverage
npm run build:qa && npm run test:budget
npm run test:browser -- --skip-build
```

O [guia de validação](docs/validacao.md) explica cada etapa, as variáveis `CONTRATOS_QA_*` e como depurar falhas de navegador.

## Convenções

- **Idioma:** interface, mensagens de commit, documentação e nomes de testes em português.
- **Commits:** uma mudança por commit, com título no imperativo ("Corrige…", "Adiciona…") e corpo quando o motivo não for óbvio.
- **Testes:** toda mudança de comportamento vem com teste. Regras de consulta e validação ficam em `test/*.test.js`; layout, teclado e acessibilidade nos testes `*.browser.mjs`.
- **Dependências:** a aplicação não tem dependências de produção. Proponha uma nova somente com justificativa e respeitando o orçamento de tamanho (`npm run test:budget`).
- **Segurança:** conteúdo vindo do PNCP é sempre montado como texto; links passam por validação. Não relaxe a CSP em [`vite.config.js`](vite.config.js).
- **Estado da interface:** respeite os donos dos campos de `state` descritos em [Arquitetura](docs/arquitetura.md#d8-estado-compartilhado-com-dono-explícito).

## Documentação

- Mudanças estruturais acrescentam ou atualizam uma decisão em [Arquitetura](docs/arquitetura.md#decisões-de-arquitetura).
- Mudanças visíveis ao usuário atualizam o [guia de uso](docs/guia-de-uso.md) e, quando forem detalhes de comportamento, [Comportamento da interface](docs/interface.md).
- Registre a mudança no [`CHANGELOG.md`](CHANGELOG.md).

## Publicação

Pushes na `main` passam pela validação completa e publicam o site no GitHub Pages; veja [Hospedagem](docs/hospedagem-estatica.md).
