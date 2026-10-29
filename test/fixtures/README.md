# Fixtures independentes

`pncp-options.json` contém recortes de respostas públicas do PNCP, com as URLs de origem e a data de captura em `provenance`. Foram preservados os campos e valores das opções; as listas foram limitadas a duas entradas e o retorno de filtros foi reduzido a quatro domínios. `original_domains` registra as chaves presentes no retorno completo, que não incluía `fontes`.

[`pncp-live/`](pncp-live/) reúne respostas completas de pesquisas, detalhes, quantidades e primeira página do histórico de edital, ata e contrato. [`provenance.json`](pncp-live/provenance.json) informa a data e a URL de cada captura. Os arquivos preservam o texto JSON original, inclusive os zeros de casas decimais, e são servidos diretamente ao cliente nos testes. As amostras incluem uma ata com mais de 60 mil eventos e um contrato cuja contagem informada diverge dos registros retornados.

Os casos cobrem anos no campo `ano`, UFs sem nome, sistemas de origem ausentes de `/filters` e sugestões diferentes para edital e contrato. Os valores esperados nos testes são explícitos e não são gerados a partir do catálogo da aplicação ou de `demoFetch`. A interface também usa esses recortes para testar a seleção de sistemas de origem com listas em cache.

Para atualizar uma captura, consulte a URL indicada com `curl --compressed --fail`, confira o JSON e preserve as estruturas relevantes ao contrato antes de recortar as listas. Alterações no PNCP exigem revisar o comportamento esperado, sem atualizar automaticamente as asserções. O CI usa somente os arquivos locais e não depende da disponibilidade do portal.

Para `pncp-live/`, mantenha a resposta completa em texto e atualize a URL e a data em `provenance.json`. Não use um parser que converta números para ponto flutuante antes de salvar o arquivo. Revise manualmente os valores esperados nos testes, pois resultados e históricos podem mudar entre capturas.

`exact-json-corpus.json` é um corpus textual de números, estruturas e erros JSON. Seus tokens devem continuar como texto para que a ferramenta que prepara o teste não arredonde os números antes de exercitar o parser.
