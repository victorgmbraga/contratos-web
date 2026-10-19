# Testes e validação

Execute os comandos na raiz com Node.js 22.12 ou superior e dependências instaladas por `npm ci`. As versões das ferramentas estão em [`package.json`](../package.json) e [`package-lock.json`](../package-lock.json).

## Núcleo e interface

```sh
npm test
```

O runner nativo executa `test/*.test.js` em sequência. A suíte cobre:

- Critérios, tipos documentais, os 80 filtros, domínios, formatos, intervalos, precisão decimal e identificadores.
- Pesquisa, paginação, ordenações compatíveis por tipo, projeção de dados, identidades e detalhes dos três tipos.
- HTTP 204/404 nos recursos permitidos, histórico de contrato com total desconhecido, falhas de formato, transporte e contagem.
- CSV, consistência entre páginas, limites de bytes/documentos, progresso e cancelamento.
- Configuração pública, fila, tentativas, prazo de operação e comunicação com o Worker.
- URL compartilhável da busca e dos detalhes, restauração dos controles, página, documento e aba, Voltar/Avançar e descarte de respostas atrasadas. Editais consultam a API de consulta, inclusive quando a rota anterior retorna HTTP 301 sem `Location`.
- Pré-carga das opções, validade de quatro horas, compactação, armazenamento indisponível, deduplicação e amparos por normativo.
- Modal com todos os filtros compatíveis, edição sem confirmação intermediária, campos sem restrição, cancelamento do rascunho, sugestões independentes e rolagem com ações visíveis.
- Ícones de coluna com filtragem direta e tooltip neutro nos três tipos, menus preservados nas colunas com ordenação, opções e intervalos, direcionamento independente de listas lentas e preservação do foco escolhido pelo usuário.
- Temas claro/escuro, preferência do sistema, persistência, sincronização entre abas, armazenamento bloqueado, contraste dos textos e controle acessível no cabeçalho.
- Seleção múltipla por campos de busca, pesquisa local sem acentos, marcação e remoção, teclado e menus suspensos que acompanham a rolagem sem alterar a altura dos grupos.
- Parser exato com corpus independente de tokens/erros, números extensos, zeros finais, notação científica, Unicode, chaves repetidas/especiais e estruturas profundas. As fixtures usam JSON textual para não arredondar os dados antes do teste.
- Paginação da tabela e preservação das linhas e da página confirmadas quando outra consulta falha.

[`test/interface.test.js`](../test/interface.test.js) usa um DOM mínimo e o serviço tipado para verificar os fluxos da interface. Os testes usam fontes controladas; a renderização é verificada no navegador.

## Navegador e artefato estático

Instale o Chromium usado pelo Playwright:

```sh
npx playwright install chromium
npm run test:browser
```

O sistema precisa das bibliotecas exigidas pelo navegador. Quando necessário, a instalação do Playwright aceita `--with-deps`. Para usar Firefox:

```sh
npx playwright install firefox
COMPRAS_QA_BROWSER=firefox npm run test:browser
```

O comando [`test/browser-smoke.mjs`](../test/browser-smoke.mjs) executa as seguintes etapas:

| Etapa | Cobertura |
| --- | --- |
| Componente de tabela | Cem linhas, conteúdo tratado como texto, paginação, foco, menus, teclado, redimensionamento, movimentação, visibilidade, cabeçalho fixo e destruição |
| Build de testes | `dist-browser-test/` com fonte controlada no Worker |
| Interface | Filtros, três tipos, links de busca e documento/aba, histórico do navegador, paginação, painéis, CSV, cancelamento, teclado e responsividade |
| Seletores | Menus reais, teclado e cancelamento, busca por letras, URL/Voltar, filtros, menu Mais, detalhes, temas/contraste, limites do viewport, estados e opções dinâmicas, formulários e texto não confiável |
| Temas | Alternância, restauração, sincronização, contraste mínimo de 4,5:1 nos textos verificados, filtros, detalhes, avisos, carregamento e tela pequena |
| Layout móvel | 320, 360, 390, 430 e 700 px; três tipos, cartões/tabela, menu de ações, campos e alvos de toque, filtros, seções/URL, paginação, paisagem e viewport reduzido |
| Cache no navegador | Quota real de `localStorage`, compactação, reutilização após reinicialização e expiração |
| Build de produção | `dist-browser/`, assets e Worker na raiz e em subdiretório |
| Layout | Cores, fontes, espaçamentos e bordas comparados com [`test/layout-baseline.json`](../test/layout-baseline.json), em 1440, 1068 e 390 pixels |
| CORS controlado | Duas origens locais, permissão e bloqueio de leitura, exposição de `Retry-After` |
| Exportação | 10.000 documentos sintéticos, resposta da interface durante a coleta, cancelamento e reutilização do Worker |
| Bundles | Ausência de dependências de Node, variáveis do processo e fixtures de teste em produção |

Esses ensaios servem arquivos estáticos e verificam a ausência de chamadas a uma API da hospedagem. A fonte de grande volume e os casos de falha são sintéticos. O teste de CORS usa requisições entre origens locais; a integração com o PNCP é verificada separadamente.

O teste isolado da tabela está em [`results-table.browser.mjs`](../test/results-table.browser.mjs). A referência visual mantém cores, fontes e espaçamentos; os papéis de display nativos da tabela e as bordas por célula representam sua estrutura semântica. Os testes de navegação utilizam identificadores da aplicação e papéis acessíveis.

O workflow [`validate.yml`](../.github/workflows/validate.yml) valida pushes da branch de refatoração e pull requests para `main` com instalação reproduzível, testes e suites de Chromium e Firefox. Ele tem apenas permissão de leitura e não publica no Pages. O workflow de publicação permanece separado.

### Medir tamanho e renderização

Após o build de produção e o build de testes gerados pela suíte:

```sh
node test/measure-build.mjs
node test/table-benchmark.mjs
```

O primeiro comando informa bytes brutos e gzip por asset e totais de JavaScript/CSS. O segundo mede atualização de 100 registros com todas as colunas, até dois frames após a consulta, descarta o aquecimento e informa sete amostras, mediana e quantidade de nós DOM. Compare execuções no mesmo navegador, máquina e condições de carga. O teste de exportação informa separadamente o custo da coleta de 10.000 documentos; esse conjunto não é montado na tabela.

### Opções do runner

| Variável | Uso |
| --- | --- |
| `COMPRAS_QA_BROWSER` | `chromium` (padrão), `firefox` ou `webkit` |
| `COMPRAS_QA_BROWSER_EXECUTABLE` | Caminho de um navegador instalado no ambiente |
| `COMPRAS_QA_CHROMIUM_EXECUTABLE` | Caminho alternativo de executável, usado quando a opção geral não está definida |
| `COMPRAS_QA_CHROMIUM_MODULE` | Módulo que fornece um executável Chromium |
| `COMPRAS_QA_PLAYWRIGHT_MODULE` | Módulo Playwright fornecido pelo ambiente |
| `COMPRAS_QA_SCREENSHOT_DIR` | Diretório existente para as capturas da interface |

Preserve o proxy e a confiança TLS exigidos pelo ambiente de execução. Um resultado só é aprovado quando o comando termina com código zero. Os resultados e tempos devem ser obtidos da execução em análise.

## Verificação manual

```sh
npm run build
npm run preview
```

Abra `http://localhost:8000/?demo=1`. Confira a troca dos três tipos, aplicação de filtros, compartilhamento/recarregamento da URL, detalhes, paginação e CSV. Abra um documento, escolha uma aba e copie a URL em outra janela: documento e aba devem ser restaurados, inclusive quando o item não aparece nos resultados. Confira também fechamento e Voltar/Avançar, sem repetir a busca ao trocar apenas a aba. O ícone do GitHub deve abrir o repositório em nova aba; em até 700 px, fica no menu **Mais**.

Em um celular, confira que busca, filtros, tipo documental e ordenação permanecem visíveis, sem rolagem horizontal do cabeçalho. Alterne cartões/tabela em **Mais**, abra detalhes, selecione outra seção e compartilhe a URL. Confira os atalhos entre grupos de filtros, a aplicação/cancelamento e os botões fixos com o teclado virtual aberto. Verifique orientação retrato/paisagem, áreas seguras, zoom e o retorno dos controles ao cabeçalho ao ampliar a tela. O teste [`mobile.browser.mjs`](../test/mobile.browser.mjs) cobre os fluxos com viewport e toque emulados; a altura reduzida simula espaço limitado e não abre um teclado virtual real.

A demonstração contém 64 contratações, 24 atas e 32 contratos. Todos os filtros têm simulação, mas os status de vigência usam a data fixa `2026-10-07`; a simulação de relevância e recebimento de propostas não reproduz integralmente a fonte. Os links dos registros fictícios são ilustrativos.

## Diagnóstico do PNCP

Abra [`pncp-diagnostic.html`](../public/pncp-diagnostic.html) servido pelo mesmo domínio HTTPS da aplicação. **Verificar acesso** consulta diretamente o PNCP na página e no Worker. **Cancelar** interrompe a verificação; **Salvar evidência** baixa um JSON com origem, data, navegador, status/cabeçalhos legíveis e resultado das operações.

O diagnóstico cobre buscas dos três tipos, paginação, ordenação/UF, filtros, sugestões, catálogos, detalhes e registros filhos. Usa documentos públicos definidos em [`public/pncp-diagnostic.js`](../public/pncp-diagnostic.js); quando disponíveis, escolhe os filhos retornados pelas listagens.

Uma resposta vazia ou HTTP 404 não comprova a consulta de um registro existente. O significado de 404 depende do recurso, conforme [Consultas ao PNCP](consultas-pncp.md). CORS, TLS e falhas de rede podem impedir que o JavaScript leia o status HTTP.

Verifique a aplicação nos navegadores e dispositivos usados pelo público, incluindo retomada de uma aba suspensa. Testes com dados sintéticos, viewport móvel ou WebKit automatizado não substituem consultas reais, dispositivo móvel ou Safari. Desempenho e acesso ao PNCP dependem da origem, da rede, do navegador e dos limites configurados.
