# Contratos Web

Aplicação para pesquisar editais e avisos de contratações, atas de registro de preços e contratos públicos no Portal Nacional de Contratações Públicas (PNCP). Executa inteiramente no navegador e consulta diretamente as APIs do PNCP.

**Acesse:** [contratos-web.net.br](https://contratos-web.net.br/)

## Funcionalidades

- Busca por texto, filtros e ordenações compatíveis com cada tipo de documento.
- Consulta de detalhes, itens, arquivos, registros vinculados e histórico dos documentos.
- Resultados paginados, tabela com colunas personalizáveis e cartões para dispositivos móveis.
- Exportação dos resultados em CSV.
- Links compartilháveis para buscas e detalhes de documentos.
- Interface responsiva com temas claro e escuro.

## Desenvolvimento local

Requisitos: **Node.js 22.12 ou superior** e **npm**. O projeto usa Node.js 24 na integração contínua.

```sh
git clone https://github.com/victorgmbraga/contratos-web.git
cd contratos-web
npm ci
npm run dev
```

Abra [http://localhost:8000](http://localhost:8000). As consultas reais precisam de acesso à internet; use o modo de demonstração para trabalhar com dados fictícios.

| Comando | Finalidade |
| --- | --- |
| `npm run demo` | Iniciar com dados fictícios |
| `npm test` | Executar os testes automatizados |
| `npm run build` | Gerar a distribuição estática em `dist-browser/` |
| `npm run preview` | Servir o build localmente |

Para os testes de navegador, instale o Chromium com `npx playwright install chromium` e execute `npm run test:browser`. Mais opções estão no [guia de validação](docs/validacao.md).

A configuração pública fica em [`public/browser-config.json`](public/browser-config.json). O conteúdo de `dist-browser/` pode ser publicado em uma hospedagem estática.

## Documentação técnica

- [Arquitetura e organização do código](docs/arquitetura.md)
- [Configuração](docs/configuracao.md)
- [Filtros e consultas ao PNCP](docs/consultas-pncp.md)
- [Testes e validação](docs/validacao.md)
- [Hospedagem e publicação](docs/hospedagem-estatica.md)

## Licenças

O código próprio deste repositório é distribuído sob a [licença MIT](LICENSE), com o aviso de copyright preservado nas cópias.

Os ícones Lucide e Feather usam as licenças ISC e MIT, conforme os avisos em [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

As ferramentas de desenvolvimento Vite e Playwright usam, respectivamente, MIT e Apache-2.0.

A licença do código não se estende aos dados consultados no PNCP, que seguem as condições do portal.
