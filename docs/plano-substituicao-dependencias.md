# Plano de substituição do Tabulator e do lossless-json

## Objetivo e branch

Substituir `tabulator-tables` e `lossless-json` por módulos próprios, preservando os recursos, a aparência e a integridade dos dados do Contratos Web. Implementar somente o que a aplicação utiliza dessas bibliotecas.

O trabalho será realizado na branch `refactor/substituir-tabulator-lossless-json`, criada a partir da `main` no commit `55e9587`. Este documento é um planejamento; as duas dependências continuam em uso até a execução das respectivas etapas.

Vite e Playwright permanecem como ferramentas de desenvolvimento, build e testes. A aplicação continua estática, com consultas e CSV no Worker, sem backend e sem novas dependências de produção.

Os commits de planejamento e implementação devem ser enviados para essa branch. A integração com `main` ocorrerá posteriormente por pull request. O workflow de publicação continua associado aos pushes para `main`; durante o desenvolvimento, não executar a publicação manual a partir da branch de trabalho. A validação da branch deve funcionar sem deploy.

## Integrações existentes

| Área | Pontos de integração | Comportamento a preservar |
| --- | --- | --- |
| Entrada da aplicação | [`public/browser-entry.js`](../public/browser-entry.js), [`public/browser-styles.css`](../public/browser-styles.css) | Inicialização da tabela e importação de CSS |
| Tabela e pesquisa | [`public/app.js`](../public/app.js) | Paginação remota, seleção e organização de colunas, formatação, menus e abertura de detalhes |
| Estilos | [`public/styles.css`](../public/styles.css) | Cores, tipografia, dimensões, rolagem e adaptação a telas pequenas |
| Leitura do PNCP | [`src/pncp-core.js`](../src/pncp-core.js) | Interpretação de todas as respostas JSON após leitura com orçamento de bytes |
| Precisão e projeção | [`src/adapter.js`](../src/adapter.js) | Conversão de números exatos para texto e de inteiros seguros para valores simples |
| Serviço e mensagens | [`src/query-core.js`](../src/query-core.js), [`src/browser/runtime.js`](../src/browser/runtime.js) | Dados projetados, metadados, validação e respostas serializáveis |
| Testes | [`test/interface.test.js`](../test/interface.test.js), [`test/ui-smoke.mjs`](../test/ui-smoke.mjs), [`test/browser-layout.js`](../test/browser-layout.js) | Fluxos da aplicação, seletores da tabela e referência visual |
| Dependências e licenças | [`package.json`](../package.json), [`package-lock.json`](../package-lock.json), [`THIRD_PARTY_LICENSES.md`](../THIRD_PARTY_LICENSES.md) | Instalação reproduzível e avisos correspondentes ao código distribuído |

O Tabulator está configurado com `movableColumns: true`, larguras ajustáveis, altura de 100%, preenchimento da área disponível e 100 registros por página. A substituição precisa contemplar esses comportamentos, além da paginação. Pesquisa, filtros e ordenação já são executados pelo PNCP; a tabela própria não fará ordenação ou filtragem local.

O uso de `lossless-json` está concentrado em `parse`, na leitura das APIs, e `isLosslessNumber`, no adaptador. Há também imports em testes. Não é necessário reproduzir APIs de escrita JSON, operações aritméticas ou extensões da biblioteca que o projeto não utiliza.

## Arquitetura proposta

### JSON com números exatos

Criar `src/exact-json.js`, independente do DOM, com uma interface pequena:

- `parseExactJson(text)`: interpreta JSON e preserva o texto original de cada token numérico.
- `ExactJsonNumber`: representação interna de um número, com texto imutável e conversão explícita para string.
- `isExactJsonNumber(value)`: identifica essa representação sem confundi-la com um objeto comum retornado pelo PNCP.

Usar um analisador de tokens com pilha explícita para objetos e arrays. Reconhecer números pela gramática JSON, sem convertê-los primeiro para `Number`. A leitura de strings pode delegar ao `JSON.parse` nativo a decodificação de um token já delimitado, preservando suas regras de escapes e Unicode. Não usar substituições globais por expressão regular sobre o documento JSON.

Essa estratégia evita depender do suporte recente ao argumento `context.source` do reviver de `JSON.parse` e mantém a compatibilidade do build atual. O parser será um módulo original, sem copiar a implementação da biblioteca removida.

Contrato de compatibilidade:

1. Preservar inteiros extensos, frações, zeros finais, zero negativo e notação científica no texto interno do número.
2. Manter strings como strings, booleanos como booleanos e `null` como ausência explícita. Números escritos dentro de uma string não devem ser reinterpretados.
3. Manter as regras atuais de `scalarText`, `decimalText` e `plain`: identificadores e valores decimais continuam em texto; `plain` converte somente os inteiros representáveis com segurança, conforme o comportamento existente. A expansão de notação científica permanece em `decimalText`, com seu limite atual.
4. Preservar a política atual para chaves repetidas: valores equivalentes são aceitos e valores conflitantes produzem erro. Caracterizar a equivalência da biblioteca atual antes da integração, inclusive números com representações diferentes e objetos aninhados.
5. Tratar `__proto__`, `constructor` e nomes de métodos como chaves de dados, sem alterar protótipos nem confundi-los com propriedades herdadas.
6. Rejeitar JSON inválido, conteúdo após o valor raiz, comentários, vírgulas finais, escapes inválidos e números fora da gramática JSON. Manter `INVALID_UPSTREAM` na fronteira do cliente PNCP, sem exigir mensagens internas idênticas às da biblioteca.
7. Preservar os orçamentos de leitura, cancelamento e prazos existentes. O parser deve percorrer a entrada sem recursão proporcional à profundidade; verificar também as travessias de normalização existentes para que entradas profundas resultem em sucesso ou erro controlado.
8. Não deixar instâncias de `ExactJsonNumber` atravessarem a fronteira do Worker. As respostas públicas continuam contendo somente objetos simples, arrays, strings, números seguros, booleanos e `null`.

`JSON.parse` continua sendo usado normalmente para configuração pública, cache e arquivos locais que já contêm dados normalizados. Não substituir esses usos pelo parser exato sem necessidade.

### Tabela própria de resultados

Criar `public/results-table.js` e `public/results-table.css`, com módulos menores para paginação e interações de colunas se a implementação justificar essa separação.

Usar uma tabela HTML semântica, com `thead`, `tbody` e `colgroup`, dentro de uma área com rolagem horizontal e vertical. O cabeçalho permanece visível durante a rolagem vertical; o rodapé e a paginação ficam fora da área rolável das linhas.

Renderizar somente os registros da página recebida e as colunas visíveis. Começar sem virtualização: são no máximo 100 registros na tabela, e o CSV de 10.000 documentos é gerado separadamente no Worker. Avaliar o custo com o maior conjunto de colunas antes de encerrar a etapa de desempenho.

A interface da tabela será própria, sem reproduzir a API do Tabulator:

| Operação ou callback | Responsabilidade |
| --- | --- |
| `createResultsTable(...)` | Receber container, colunas, renderizadores e callbacks da aplicação |
| `setColumns(columns)` | Aplicar definições e visibilidade das colunas do tipo documental |
| `setColumnVisibility(field, visible)` | Alterar uma coluna sem perder as larguras e a ordem das demais |
| `renderPage({rows, page, pageSize, lastPage})` | Renderizar uma resposta concluída e atualizar a navegação |
| `setStatus(...)` | Exibir estados de carregamento, vazio e falha sem apagar resultados válidos |
| `clear()` e `destroy()` | Limpar registros e liberar listeners, observadores, menus e interações pendentes |
| `onPageChange(page)` | Solicitar à aplicação uma página, inclusive a página atual ao atualizar resultados |
| `onOpenDocument(row)` | Abrir detalhes do registro pelo fluxo existente |
| `onColumnAction(field, action)` | Acionar filtro ou ordenação compatível com a coluna |

A aplicação continua sendo a dona da consulta, da URL, dos tokens de sequência, dos abortos e do resultado confirmado. O componente não acessa o PNCP nem gera CSV. O contador e os metadados existentes em `#result-info` continuam sendo preenchidos a partir da resposta do serviço, sem recalcular o total com base nas linhas visíveis.

Requisitos de interação:

- Paginação com primeira, anterior, até quatro páginas numeradas, próxima e última; preservar ícones, estados ativos/desabilitados e janela acessível de 10.000 documentos.
- Respeitar `last_page` do serviço, inclusive no resultado vazio. O total real continua no contador, com aviso quando excede a janela acessível.
- Carregar diretamente uma página da URL, atualizar a página atual, repetir a página que falhou e reiniciar na primeira ao aplicar novos critérios.
- Manter os resultados anteriores em falhas e cancelamentos, sem apresentar uma página como concluída antes da resposta. Respostas antigas não podem alterar linhas, paginação ou metadados.
- Preservar visibilidade, ordem e larguras de colunas no mesmo escopo da versão atual. A mudança não acrescenta persistência dessas preferências em `localStorage`.
- Redimensionar colunas com largura mínima de 85 px e mover colunas. Usar Pointer Events para mouse/toque e oferecer operação por teclado; redimensionar ou arrastar não deve abrir um documento nem acionar o menu.
- Manter menus somente nas colunas com filtro compatível, ícone após o título e opções de ordenação nativa somente quando declaradas no esquema.
- Menus devem caber no viewport, fechar com Escape ou clique externo e devolver foco ao botão de origem.
- Preservar formatação de datas, dinheiro, quantidades, ausências e situações, bem como o objeto limitado a duas linhas.
- Manter o clique na linha e oferecer uma ação de abertura de detalhes focável no título. Preservar seleção de texto e ações de links/botões sem ativar a linha indevidamente.
- Usar nomes acessíveis, estado da página atual, indicação de carregamento e foco visível; manter tooltips e o comportamento móvel do restante da interface.
- Montar conteúdo do PNCP com `textContent` e nós DOM; não interpretar os dados recebidos como HTML.

Os nomes `.tabulator-*` serão retirados dos estilos e testes ao final. Os testes de navegação devem preferir papéis acessíveis, nomes e identificadores estáveis da aplicação. Os testes de estilo podem usar classes próprias para os elementos visuais.

## Etapas de implementação

Executar na ordem abaixo, mantendo cada etapa validável e em commits separados na branch de trabalho.

| Etapa | Entrega | Condição para avançar |
| --- | --- | --- |
| 1. Referência e contratos | Registrar o comportamento atual, medidas de build e casos de dados; preparar validação da branch sem publicação | Suítes atuais aprovadas e referência visual/funcional disponível |
| 2. Parser isolado | Implementar `exact-json.js` e testes de gramática, precisão e equivalência | Corpus válido/inválido e comparação com a biblioteca atual aprovados |
| 3. Integração do parser | Trocar imports de produção e testes, preservar projeções/RPC/CSV e remover `lossless-json` | Núcleo, Worker, testes de integração e exportação aprovados sem a dependência |
| 4. Componente de tabela | Implementar renderização, paginação, menus, colunas, teclado e estilos isoladamente | Contratos de interação e estados assíncronos testados sem trocar a tabela principal |
| 5. Integração da tabela | Migrar `app.js`, entrada, CSS, testes da interface e seletores do navegador; remover Tabulator | Três tipos documentais, URL, detalhes, CSV e aparência equivalentes |
| 6. Encerramento | Validar distribuição, desempenho, documentação, licenças e lockfile; preparar pull request | Todos os critérios de aceite atendidos e comparativo anexado ao PR |

### Etapa 1: referência e validação da branch

- Executar `npm ci`, `npm test`, `npm run test:browser` e `npm run build` antes da substituição para obter uma referência reproduzível.
- Capturar editais, atas e contratos nas larguras de 1440, 1068 e 390 px. Incluir tabela com todas as colunas, texto longo, página vazia, carregamento e falha mantendo resultados.
- Caracterizar movimentação/redimensionamento de colunas, teclado, menus e posição das barras de rolagem; adicionar cobertura onde a suíte atual não registra o comportamento.
- Registrar tamanhos bruto e gzip do JavaScript e CSS distribuídos, separando entrada, chunks compartilhados e Worker. Medir renderização de 100 linhas e a coleta CSV de 10.000 documentos no mesmo ambiente.
- Preparar uma validação em CI para a branch e para o futuro pull request, com permissões de leitura, `npm ci`, testes, build e Chromium do Playwright. Não dar a esse fluxo permissões de publicação do Pages.

### Etapas 2 e 3: precisão antes da interface

- Testar inteiros próximos de `Number.MAX_SAFE_INTEGER`, acima desse limite e negativos; decimais longos; `0`, `-0`, `0.0000`; expoentes positivos/negativos e valores além da capacidade de `Number`.
- Testar valores escalares na raiz, objetos e arrays vazios/aninhados, espaços permitidos, strings com aspas, barras, Unicode, escapes e trechos que parecem números.
- Testar JSON truncado, delimitadores inválidos, lixo após a raiz, números inválidos, duplicidade de chaves e propriedades com nomes especiais.
- Comparar o parser novo e o atual com um corpus determinístico e casos gerados com semente fixa. Comparar os números pelo texto original e pelas projeções finais; não usar `Number` ou `JSON.stringify` como único oráculo de precisão.
- Guardar as expectativas de equivalência e as entradas relevantes em fixtures próprias antes de retirar a dependência de referência. Testes de ida e volta escritos somente com a implementação nova não bastam.
- Exercitar leitura em chunks, detalhes e registros filhos, domínios/sugestões, validação de contagens e totais, cache normalizado, RPC e CSV. Entradas numéricas exatas nos testes devem ser JSON textual: `Response.json` de um `Number` já arredondado não testa a preservação original.
- Migrar todos os imports de teste, remover a dependência com npm e atualizar o lockfile. Manter o tratamento de HTTP, inclusive as regras existentes de 404 e histórico com quantidade desconhecida.

### Etapas 4 e 5: substituição da tabela

- Extrair renderizadores e ações de coluna que hoje recebem objetos do Tabulator para funções baseadas no valor da célula e na definição do esquema.
- Substituir o contrato `ajaxRequestFunc`/`setPage` por um fluxo explícito: evento de navegação, consulta pela aplicação, validação da sequência e renderização do resultado confirmado.
- Inicializar a pesquisa uma única vez após o componente ficar pronto, sem depender do evento `tableBuilt`. Detalhes de um link direto devem continuar carregando mesmo se a busca falhar.
- Adaptar o componente injetado em `test/interface.test.js` para o contrato próprio. Testar o componente real no navegador; o substituto do DOM mínimo não comprova renderização, redimensionamento ou rolagem.
- Migrar os seletores de `test/ui-smoke.mjs`, `test/detail-links.browser.mjs`, `test/browser-layout.js` e da referência de estilos. Preservar cores, tipografia, espaçamentos e dimensões; mudanças técnicas de semântica/display devem ser justificadas sem simplesmente aceitar uma nova aparência como referência.
- Remover a importação JS e CSS do Tabulator, seu parâmetro de injeção, comentários e estilos obsoletos. Remover o pacote e atualizar o lockfile após a integração passar nos testes.

### Etapa 6: encerramento

- Atualizar README, arquitetura e guia de validação para os módulos efetivamente implementados. Manter este plano como referência enquanto o trabalho estiver ativo; ao concluir, incorporar as decisões permanentes aos guias e retirar o plano da documentação principal.
- Ajustar `THIRD_PARTY_LICENSES.md` conforme o código que permanece distribuído. Retirar avisos das bibliotecas removidas somente quando não houver código delas no artefato; manter os avisos dos ícones utilizados.
- Confirmar ausência dos dois pacotes no manifesto, lockfile, imports e bundles. Citações explicativas em documentos não equivalem a dependência remanescente.
- Medir novamente o build e os cenários de desempenho da etapa 1. O JavaScript de produção em gzip deve diminuir; investigar regressões de renderização, memória e exportação antes de integrar. Não prometer ganho percentual antes da medição.
- Executar novamente a validação completa após integrar eventuais atualizações da `main` na branch e preparar o pull request com resultados e limitações observadas.

## Critérios de aceite

- [ ] `tabulator-tables` e `lossless-json` removidos, sem bibliotecas substitutas de produção ou CDN.
- [ ] Vite, Playwright e execução exclusivamente no navegador preservados.
- [ ] Precisão mantida na leitura, projeção, mensagens do Worker, filtros e CSV, incluindo as fixtures de números extensos.
- [ ] Pesquisa, 80 filtros do catálogo, sugestões, cache de quatro horas, ordenações por tipo e paginação continuam funcionando.
- [ ] URLs de busca, página, documento e aba, recarregamento e Voltar/Avançar mantêm o comportamento atual.
- [ ] Três tipos de documento e todas as abas/listagens dos detalhes preservados, com os tratamentos atuais de erro e listas vazias.
- [ ] Colunas podem ser selecionadas, redimensionadas e movimentadas; menus, foco e teclado funcionam com os três tipos.
- [ ] Falha/cancelamento preserva o resultado confirmado e respostas atrasadas são descartadas.
- [ ] Layout equivalente nas três larguras de referência, sem sobreposição, perda de ações ou mudança indesejada de rolagem.
- [ ] `npm ci`, `npm test`, `npm run test:browser` e `npm run build` aprovados; instalação sem conflitos e auditoria revisada.
- [ ] Artefato funciona na raiz e em subdiretório; exportação de 10.000 documentos mantém a interface responsiva, pode ser cancelada e permite reutilizar o Worker.
- [ ] Navegação, precisão e operações de coluna verificadas também em Firefox; diferenças específicas de navegador registradas e corrigidas quando afetarem funcionalidades.
- [ ] Comparativo de tamanho/desempenho e documentação concluídos; branch validada sem alterar a publicação de produção.

## Riscos e recuperação

| Risco | Tratamento |
| --- | --- |
| Perda silenciosa de dígitos | Parser preserva tokens, testes diferenciais e fixtures textuais até o CSV |
| Mudança de validação ao remover a biblioteca | Caracterizar números, propriedades especiais e chaves repetidas antes de trocar o parser |
| Regressões de layout/interação | Referência anterior, testes visuais por elemento e cenários de colunas em diferentes viewports |
| Estado divergente entre URL, tabela e pesquisa | Aplicação concentra requisições e confirmação do estado; componente só solicita navegação e renderiza respostas válidas |
| Aumento de código ou custo de renderização | Escopo limitado às funções usadas, até 100 linhas por página e comparação de métricas no mesmo ambiente |
| Manutenção de um parser próprio | API pequena, testes de gramática/entradas inválidas e ausência de funcionalidades genéricas não utilizadas |

Manter a troca do parser e a troca da tabela em commits independentes. Se uma etapa regredir, corrigir ou reverter seus commits na branch antes de avançar. As dependências anteriores podem ser restauradas pelo manifesto e lockfile do commit correspondente, sem manter implementações duplicadas ou um seletor permanente entre versões em produção.
