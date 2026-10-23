# sitezinho.

Um laboratório pequeno e independente de HTML, CSS e JavaScript puro. Quatro experimentos interativos: pintura em pixels, sintetizador com Web Audio, gerador de paletas e jogo da memória.

Não tem build, dependências, cookies ou chamadas de rede. A pasta inteira pode ser aberta diretamente ou publicada em qualquer hospedagem estática.

## Rodar localmente

```sh
python3 -m http.server 4173 --directory sitezinho
```

Depois abra <http://localhost:4173>. Também funciona abrindo `index.html` no navegador, embora um servidor local deixe o clipboard mais feliz.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `index.html` | Estrutura e textos do site |
| `styles.css` | Tema claro/escuro, layout e animações |
| `script.js` | Constelação em canvas, pintura, som, paletas, memória e detalhes de interação |
| `favicon.svg` | Ícone |

## Detalhes para explorar

- A constelação do topo reage ao cursor e pausa quando a aba fica escondida.
- A pintura tem traço contínuo entre eventos, exportação em PNG e sprites simétricos.
- O sintetizador usa osciladores, envelope de volume e um delay construídos com a Web Audio API.
- As paletas podem ter cores fixadas com o cadeado.
- O recorde do jogo fica no `localStorage`.
- Existe um código secreto escondido na página. A dica está no rodapé.
