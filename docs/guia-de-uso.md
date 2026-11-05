# Guia de uso

Este guia explica como pesquisar no [Contratos Web](https://contratos-web.net.br/). A aplicação consulta diretamente o Portal Nacional de Contratações Públicas (PNCP); os dados exibidos são os da fonte no momento da consulta.

## Escolher o tipo de documento

O seletor ao lado da busca alterna entre três tipos:

- **Editais**: editais e avisos de contratações (licitações, dispensas e inexigibilidades);
- **Atas**: atas de registro de preços;
- **Contratos**: contratos e empenhos.

Cada tipo tem colunas, filtros e ordenações próprios. Trocar o tipo reinicia os critérios.

## Pesquisar

Digite palavras do objeto, do órgão ou outros termos no campo de busca e pressione **Enter** ou o botão de lupa. Os atalhos `/` e `Ctrl+K` (`⌘K` no macOS) levam ao campo de busca. Durante a consulta, o botão de lupa vira **Cancelar pesquisa**.

Ao abrir a página sem critérios, a aplicação mostra os documentos mais recentes do tipo escolhido.

### Buscas prontas e buscas salvas

O botão de marcador no fim do campo de busca abre **Buscas prontas e dicas**:

- **Buscas prontas** pesquisam editais de serviço divulgados, com itens em andamento ou homologados, por fornecedor ou tema: Microsoft, Oracle, Adobe, Symantec e Broadcom, antivírus e proteção de endpoints, Graebert e CAD, MongoDB e NoSQL, e, só na esfera federal e em pregão eletrônico, desenvolvimento de software e infraestrutura/service desk. Escolher uma preenche o texto (os termos combinados com `OR`) e os filtros e pesquisa na hora; depois, ajuste os filtros se precisar.
- **Minhas buscas** guarda neste navegador a busca atual (texto, mesmo que ainda não pesquisado, filtros, status e tipo de documento) com o nome que você escolher. Um nome já usado é substituído. Cabem até 30 buscas; o **×** remove uma delas. As buscas salvas não vão para outros navegadores; para compartilhar uma consulta, copie o link.

A busca textual aceita até 1.000 caracteres, o suficiente para listas de termos com `OR`.

### Combinar termos

A busca do PNCP aceita operadores. A seção **Dicas de busca** do mesmo painel mostra estes exemplos, e cada um pode ser escolhido para preencher a busca:

| Para encontrar | Digite | Exemplo |
| --- | --- | --- |
| Todas as palavras | os termos separados por espaço | `microsoft office` |
| Qualquer uma delas | `OR`, em maiúsculas, entre os termos | `microsoft OR o365 OR office` |
| Excluir um termo | `NOT` antes do termo | `office NOT microsoft` |
| Uma frase exata | o texto entre aspas | `"microsoft office"` |

Maiúsculas não fazem diferença nos termos. `or` minúsculo é tratado como palavra comum, e `-` e `*` não funcionam como operadores. A busca não se restringe ao objeto: uma busca por `microsoft` traz, por exemplo, compras de notebooks com Windows, porque o termo aparece nos itens. Segundo o PNCP, nas contratações o texto é procurado em:

- número de controle PNCP (com máscara) e número da contratação (número e ano);
- descrição do objeto e informação complementar;
- CNPJ ou nome do órgão/entidade e código ou nome da unidade compradora/vendedora, inclusive sub-rogados;
- descrição ou informação complementar dos itens, código GTIN e código ou descrição NCM/NBS;
- código de patrimônio ou de registro imobiliário;
- CNPJ, CPF, nome ou identificação (estrangeiros) de fornecedor ou arrematante;
- ano da contratação.

Não há como restringir a busca a um desses campos. A lista também aparece em **Onde a busca procura**, nas dicas de busca.

## Filtrar

O botão **Filtros** abre o modal com todos os filtros compatíveis com o tipo:

- **Principais** reúne os mais usados: período de publicação, início do recebimento de propostas (editais) ou da vigência (atas e contratos), UF, município, órgão, modalidade, situação, faixas de valor e fornecedor (conforme o tipo).
- **Status temporal** dos editais: recebendo propostas, em julgamento (propostas encerradas), encerradas ou todos; de atas e contratos: vigentes, não vigentes ou todos.
- **Buscar filtro pelo nome** encontra rapidamente um filtro específico, por exemplo "valor" ou "homologação".
- Campos de lista abrem opções pesquisáveis.
- **Município** e **Município do fornecedor** usam a relação oficial do IBGE: ao abrir, mostram as capitais (ou os municípios das UFs já escolhidas) e filtram a partir da primeira letra, sem acento e com a UF no nome (por exemplo `Bom Jesus/PI`). Digitar a UF junto, como "bom jesus pi", também funciona.
- Órgão, unidade, fornecedor, fonte/plataforma e os campos sub-rogados dependem da busca do PNCP, que exige ao menos três caracteres. Antes disso, a lista mostra as opções **usadas recentemente** neste navegador.
- Datas e valores com **mínimo**/**máximo** ou **a partir de**/**até** formam intervalos; preencha só um lado para limitar apenas esse lado.
- Números seguem o padrão brasileiro: vírgula para decimais e ponto apenas para separar milhares. Valores em reais aparecem como `R$ 1.000,50`, percentuais aceitam só dígitos, vírgula e `%` (por exemplo `5,25%`) e quantidades usam vírgula (`1.500,5`). Um número com ponto no lugar da vírgula, como `1000.50`, é indicado como inválido e impede aplicar os filtros até ser corrigido.

Os filtros se combinam: o resultado precisa atender a todos. Dentro de um mesmo filtro de lista, as opções escolhidas se somam (qualquer uma delas serve). As alterações valem somente depois de **Aplicar e pesquisar**; fechar o modal descarta o rascunho. O número ao lado de **Filtros** indica quantos critérios estão ativos, e **Limpar filtros** remove todos.

O ícone de funil no cabeçalho de uma coluna abre diretamente o filtro correspondente.

## Ler os resultados

- A tabela mostra até 100 documentos por página; no celular, os resultados aparecem como cartões, e o menu **Mais** alterna para tabela.
- Clicar no título de uma coluna ordenável alterna entre ordem crescente e decrescente; o seletor de ordenação oferece as opções do PNCP para o tipo.
- O botão de colunas escolhe quais colunas aparecem, sua ordem e largura; a escolha fica salva neste navegador para cada tipo. Em editais, a lista de colunas também oferece os dados que o PNCP mostra em cada edital: **Início das propostas** e **Fim das propostas** (data e hora), **Amparo legal**, **Modo de disputa**, **Registro de preços**, **Fonte orçamentária**, **Fonte/Plataforma**, **Órgão sub-rogado** e **Unidade sub-rogada**.

### Janela de 10.000 resultados

O PNCP permite navegar somente pelos primeiros 10.000 resultados de uma pesquisa. Quando o total é maior, um ícone de alerta aparece ao lado da contagem. Para alcançar os demais documentos, refine a pesquisa (por exemplo, por período, UF ou órgão).

## Ver os detalhes

Clique em uma linha ou cartão para abrir o painel de detalhes. Na aba **Detalhes**, a identificação (Controle PNCP, documentos de origem, fonte e processo eletrônico) e os campos principais (como órgão, situação, valor e datas) aparecem primeiro, em negrito; o link de **Controle PNCP** abre a página oficial do documento. As abas mostram todos os campos, itens, arquivos, documentos vinculados e o histórico. Abas de listas carregam em segundo plano; com economia de dados ativada, elas só carregam quando selecionadas.

## Compartilhar

O endereço da página guarda o tipo, o texto, os filtros, a ordenação, a página e o documento aberto. Copie o link para compartilhar exatamente a mesma consulta; **Voltar** e **Avançar** do navegador também restauram as consultas anteriores.

## Exportar para CSV

O botão **Exportar** oferece:

- **Toda a consulta**: refaz a pesquisa no PNCP e coleta todos os resultados, até 10.000 documentos, com progresso e estimativa de tempo. Pode levar cerca de um minuto para consultas grandes e pode ser cancelada.
- **Página atual**: exporta somente os documentos da página exibida.

O arquivo usa UTF-8 com separador vírgula e inclui todas as colunas do tipo, mesmo as ocultas na tabela. Como a exportação consulta a fonte de novo, os dados podem diferir ligeiramente do que estava na tela. Abra-o no Excel, LibreOffice ou Google Planilhas.

## Quando algo dá errado

- **PNCP instável**: a tabela mantém o último resultado confirmado; use **Tentar novamente** em alguns instantes.
- **Sem conexão**: um aviso aparece até a rede voltar.
- **Link inválido**: a aplicação explica qual parâmetro está errado e não pesquisa; ajuste os critérios ou limpe os filtros.

A página [`pncp-diagnostic.html`](https://contratos-web.net.br/pncp-diagnostic.html) verifica se o seu navegador consegue acessar o PNCP.
