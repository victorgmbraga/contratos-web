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

## Filtrar

O botão **Filtros** abre o modal com todos os filtros compatíveis com o tipo:

- **Principais** reúne os mais usados: período de publicação, UF, município, órgão, modalidade, situação, faixas de valor, vigência e fornecedor (conforme o tipo).
- **Buscar filtro pelo nome** encontra rapidamente um filtro específico, por exemplo "valor" ou "homologação".
- Campos de lista abrem opções pesquisáveis; órgão, unidade, município e fornecedor sugerem valores a partir de três caracteres.
- Datas e valores com **mínimo**/**máximo** ou **a partir de**/**até** formam intervalos; preencha só um lado para limitar apenas esse lado.

Os filtros se combinam: o resultado precisa atender a todos. Dentro de um mesmo filtro de lista, as opções escolhidas se somam (qualquer uma delas serve). As alterações valem somente depois de **Aplicar e pesquisar**; fechar o modal descarta o rascunho. O número ao lado de **Filtros** indica quantos critérios estão ativos, e **Limpar filtros** remove todos.

O ícone de funil no cabeçalho de uma coluna abre diretamente o filtro correspondente.

## Ler os resultados

- A tabela mostra até 100 documentos por página; no celular, os resultados aparecem como cartões, e o menu **Mais** alterna para tabela.
- Clicar no título de uma coluna ordenável alterna entre ordem crescente e decrescente; o seletor de ordenação oferece as opções do PNCP para o tipo.
- O botão de colunas escolhe quais colunas aparecem, sua ordem e largura; a escolha fica salva neste navegador para cada tipo.

### Janela de 10.000 resultados

O PNCP permite navegar somente pelos primeiros 10.000 resultados de uma pesquisa. Quando o total é maior, um ícone de alerta aparece ao lado da contagem. Para alcançar os demais documentos, refine a pesquisa (por exemplo, por período, UF ou órgão).

## Ver os detalhes

Clique em uma linha ou cartão para abrir o painel de detalhes. Na aba **Detalhes**, os campos principais (como órgão, situação, valor e datas) aparecem primeiro, em negrito; o link de **Controle PNCP** abre a página oficial do documento. As abas mostram todos os campos, itens, arquivos, documentos vinculados e o histórico. Abas de listas carregam em segundo plano; com economia de dados ativada, elas só carregam quando selecionadas.

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
