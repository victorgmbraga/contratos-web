# Contratos Web

Pesquisa de editais e avisos de contratações, atas de registro de preços e contratos públicos nas APIs do Portal Nacional de Contratações Públicas (PNCP).

A aplicação executa no navegador. Consultas, validação de filtros e geração de CSV usam um Web Worker; a hospedagem serve arquivos estáticos. O navegador precisa de acesso à internet e de respostas do PNCP com CORS válido.

A tabela e a leitura de JSON com precisão numérica são módulos do próprio projeto. Não há dependências de produção; Vite e Playwright são usados no desenvolvimento, no build e nos testes.

## Usar a aplicação

1. Escolha **Editais e Avisos de Contratações**, **Atas de Registro de Preços** ou **Contratos**. Digite a busca e use o botão com ícone de lupa. Sem critérios na URL, a aplicação pesquisa contratações sem filtros.
2. Use o botão com ícone de filtro para editar os critérios. O modal exibe todos os filtros disponíveis para o tipo documental, agrupados e com rolagem interna. Preencha os campos desejados e selecione **Aplicar e pesquisar**; campos vazios ou **Selecionar** não filtram os resultados. O X de cada campo limpa aquele critério; cancelar descarta as alterações. Filtros e ordenações dependem do tipo documental. O filtro com um X (**Limpar filtros**) remove os critérios aplicados.
3. Navegue pelos resultados, com 100 documentos por página. Novos critérios começam na página 1. **Atualizar** repete a última consulta concluída; **Tentar novamente** repete a página que falhou. O X em um círculo (**Cancelar pesquisa**) interrompe a consulta em andamento.
4. Clique em uma linha para abrir seus detalhes. O título do painel é o título da linha; **Abrir no PNCP** e **Sistema de origem**, quando disponíveis, ficam junto ao botão de fechar.
5. Use **Selecionar colunas** para ajustar a tabela. Colunas com filtro exibem um ícone após o nome: quando há apenas filtragem, o clique abre diretamente o campo correspondente e o tooltip indica **Filtrar por esta coluna**. Colunas que também permitem ordenação exibem um menu com as ações disponíveis.
6. Use **Exportar CSV** para coletar todos os documentos dos últimos critérios concluídos, desde a primeira página. O arquivo inclui todas as colunas do tipo documental. A coleta mostra progresso e pode ser interrompida pelo X em um círculo (**Cancelar CSV**).

O ícone do GitHub abre o repositório em nova aba. Em telas pequenas, fica no menu **Mais**, junto com atualizar, selecionar colunas, limpar filtros, exportar CSV e alternar o tema.

O botão de sol/lua, junto ao GitHub, alterna entre os modos claro e escuro. No primeiro acesso, o tema acompanha a preferência do sistema. A escolha fica salva no navegador e é sincronizada entre abas; se o armazenamento estiver bloqueado, a alternância continua funcionando na página aberta.

Os seletores simples usam menus com o mesmo visual nos temas claro e escuro, marcação da opção selecionada e rolagem para listas extensas. Clique para abrir ou use **Enter/Espaço**; **↑/↓**, **Home/End** e a digitação das primeiras letras percorrem as opções. **Enter/Espaço** confirma; **Escape**, **Tab** ou um clique fora fecham sem aplicar a opção apenas destacada. As alterações nos filtros continuam sendo rascunhos até **Aplicar e pesquisar**.

As colunas podem ser redimensionadas pela borda direita ou movimentadas pelo título. Pelo teclado, foque o título e use **Alt + ←/→** para mover; no controle de largura, use **←/→** ou **Home** para a largura mínima. O título de cada registro também permite abrir os detalhes pelo teclado.

### Dispositivos móveis

Em telas de até 700 px, o cabeçalho não exibe a marca. A primeira linha contém busca, pesquisar e filtros; a segunda contém tipo documental, ordenação e o ícone **Mais**. Os seletores dividem igualmente o espaço disponível até o ícone, preenchendo a linha. A ação **Limpar filtros** fica em **Mais**. Os resultados usam cartões com título, resumo do objeto, órgão, local e campos próprios do documento: valor estimado e publicação em editais, valor global e início da vigência em contratos, início e fim da vigência em atas. Toque no cartão ou no título para abrir os detalhes.

Em **Mais → Visualização dos resultados**, escolha **Tabela** para comparar todas as colunas ou **Cartões** para retomar a leitura compacta. Essa escolha é mantida durante o uso da página; telas maiores sempre exibem a tabela. A seleção de colunas afeta a tabela; os cartões mantêm seus campos de resumo.

A paginação mostra até cinco páginas numeradas e os botões de primeira, anterior, próxima e última página. No celular, os botões se distribuem por toda a largura disponível. Os filtros ocupam a tela, com atalhos **Ir para o grupo**, todos os campos disponíveis e ações fixas. Nos detalhes, um seletor substitui as abas e preserva suas contagens e o link compartilhável. O fechamento permanece acessível durante a rolagem; telas abaixo de 401 px exibem os campos de detalhes em uma coluna.

### Detalhes dos documentos

| Tipo | Abas |
| --- | --- |
| Edital/aviso | Detalhes, Itens, Arquivos, Atas de Registro de Preço, Contratos/Empenhos, Histórico |
| Ata | Detalhes, Partes envolvidas, Contratos, Arquivos, Histórico |
| Contrato | Detalhes, Empenhos, Instrumentos de cobrança, Termos, Arquivos, Histórico |

Ao abrir o painel, os dados completos de atas/contratos e a primeira página de cada listagem carregam em segundo plano. As abas exibem contadores; cada listagem tem paginação e tratamento de falhas próprios. Quando o total de páginas é conhecido, a paginação segue o padrão da busca: até cinco páginas próximas à atual e botões de primeira, anterior, próxima e última página. Arquivos de termos e detalhes de empenhos/instrumentos de cobrança carregam ao selecionar o registro.

Quando o PNCP informa uma contagem incompatível com os eventos do histórico de um contrato, a aba mostra **Histórico (?)** e **Quantidade desconhecida**. Nesse caso, a paginação mostra apenas os botões de anterior/próxima e o número da página atual. É possível tentar a próxima página até encontrar uma página vazia. HTTP 404 significa lista vazia em **Contratos/Empenhos** de uma contratação e nas listas **Empenhos** e **Instrumentos de cobrança** de um contrato. As demais regras estão no [guia de consultas](docs/consultas-pncp.md).

### Filtros, cache e limites

O catálogo contém 80 filtros: 71 aplicáveis a contratações, 16 a atas e 32 a contratos. Há filtros compartilhados entre tipos. Órgãos, unidades e fornecedores usam os IDs fornecidos pelo PNCP. Informação ausente é distinta de **Não**, zero ou lista vazia.

Filtros com múltiplas opções usam campos de busca com menus suspensos logo abaixo do campo. Clique nas opções para marcar ou desmarcar e use o X das etiquetas para removê-las. Listas completas são filtradas localmente; catálogos parciais, como órgãos e unidades, buscam no PNCP a partir de três caracteres. As setas percorrem as opções, Enter alterna a escolha e Escape fecha o menu.

As opções dos três tipos são carregadas na inicialização e armazenadas no `localStorage` por quatro horas. Listas grandes são compactadas; se o armazenamento estiver indisponível, o cache funciona em memória. Amparos dependentes de normativos carregam sob demanda. Sugestões por texto e consultas de documentos acessam novamente a fonte.

A tabela mantém a ordem, os resultados e o total do PNCP. A janela de navegação alcança até 10.000 documentos; refine a pesquisa para acessar conjuntos maiores. O CSV exige que o total caiba no limite de exportação configurado. Filtros de itens selecionam contratações, enquanto os detalhes exibem todos os itens. Os dados podem mudar entre consultas.

As ordenações acompanham o tipo de documento: editais oferecem controle PNCP e valor estimado; atas, maior/menor valor; contratos, número da contratação, controle PNCP, início da vigência e valor global. Todos oferecem mais recentes, mais antigas e relevância. A ordenação por relevância pode ser usada com ou sem texto de busca, conforme o PNCP. Veja os [códigos das ordenações](docs/consultas-pncp.md#ordenações-por-tipo-de-documento).

## Compartilhar uma busca ou um documento

Copie a URL da barra de endereços depois de pesquisar, aplicar filtros ou mudar de página. O link contém busca, filtros aplicados, tipo documental, ordenação e página. Abrir o link, recarregar ou usar **Voltar/Avançar** restaura esses critérios.

```text
https://contratos-web.net.br/?tipos_documento=contrato&q=reforma&status=vigente&ordenacao=-data&pagina=2&possui_nfe=false
```

Os parâmetros usam os nomes do PNCP. Listas usam `|` codificado como `%7C`, por exemplo `ufs=SP%7CDF`; booleanos usam `true`/`false`. Alterações no painel de filtros só entram na URL ao aplicar. Um link inválido exibe um aviso e permite corrigir ou limpar os critérios. Veja o [formato completo dos parâmetros](docs/consultas-pncp.md#url-compartilhável-da-interface).

Ao abrir um item e selecionar uma aba, a URL também inclui `detalhe` e `aba`. Copie esse endereço para compartilhar o painel de um edital, ata ou contrato. O link abre diretamente o documento e a aba indicada, mesmo que o item não apareça na página atual da busca:

```text
https://contratos-web.net.br/?tipos_documento=contrato&detalhe=contrato/87711503000153/2025/50&aba=historico
```

Fechar o painel remove esses dois parâmetros e mantém a busca. **Voltar/Avançar** restaura a abertura, o fechamento e a aba selecionada; aplicar uma nova busca fecha o painel.

## Executar localmente

Na raiz do repositório, use **Node.js 22.12 ou superior** e npm. O workflow de publicação usa Node.js 24.

```sh
npm ci
npm run dev
```

Abra `http://localhost:8000`. Para usar dados fictícios, execute `npm run demo` ou acrescente `?demo=1` à URL. A demonstração contém 64 contratações, 24 atas e 32 contratos e identifica sua fonte na interface.

| Comando | Finalidade |
| --- | --- |
| `npm start` ou `npm run dev` | Desenvolvimento com Vite e recarga automática |
| `npm run demo` | Desenvolvimento com dados fictícios |
| `npm test` | Testes do núcleo, filtros, interface e comunicação com o Worker |
| `npm run test:browser` | Testes de interface, cache, layout, CORS, artefato e CSV em navegador |
| `npm run build` | Gera a distribuição estática em `dist-browser/` |
| `npm run preview` | Serve o build em `http://localhost:8000` |

Os testes de navegador precisam de um navegador instalado pelo Playwright ou de um executável configurado. Consulte [Testes e validação](docs/validacao.md).

## Configurar e publicar

A configuração pública fica em [`public/browser-config.json`](public/browser-config.json); `{}` usa os padrões. As opções e os limites estão em [Configuração](docs/configuracao.md).

Execute `npm run build` e publique o conteúdo de `dist-browser/` por HTTPS. Os caminhos relativos permitem publicar na raiz ou em um subdiretório, como `/contratos-web/`. Node.js é necessário para as ferramentas de desenvolvimento e build; o artefato publicado executa no navegador.

O [workflow do GitHub Pages](.github/workflows/static-pages.yml) executa testes, gera o build e publica cada commit enviado à `main`, com opção de execução manual. O [guia de hospedagem](docs/hospedagem-estatica.md) descreve a configuração do Pages, cabeçalhos, atualização e diagnóstico do acesso ao PNCP.

## Documentação

- [Arquitetura e organização do código](docs/arquitetura.md)
- [Configuração, rede e limites](docs/configuracao.md)
- [Serviço do navegador, filtros e consultas ao PNCP](docs/consultas-pncp.md)
- [Testes e validação](docs/validacao.md)
- [Hospedagem estática](docs/hospedagem-estatica.md)

As licenças das dependências e dos ícones estão em [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
