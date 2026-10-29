# Hospedagem estática

A aplicação está disponível em [contratos-web.net.br](https://contratos-web.net.br/). O repositório é [victorgmbraga/contratos-web](https://github.com/victorgmbraga/contratos-web).

O artefato de produção é `dist-browser/`. A hospedagem entrega HTML, JavaScript, CSS, favicon, licenças, `theme-boot.js`, `sw.js` e `browser-config.json`; o navegador consulta o PNCP e gera o CSV.

## Gerar e verificar

Use Node.js 24 (LTS) ou superior na máquina de build. Antes de compilar, ajuste [`public/browser-config.json`](../public/browser-config.json) conforme [Configuração](configuracao.md). `{}` usa o PNCP real e os limites padrão. O arquivo é público.

```sh
npm ci
npm test
npm run build
npm run preview
```

Abra `http://localhost:8000` para consultar a fonte real. O preview usa os arquivos compilados.

Publique **todo o conteúdo de `dist-browser/`**, incluindo `assets/`. Os caminhos relativos permitem servir na raiz ou em um diretório como `/contratos-web/`; abra a URL do diretório com barra final. A hospedagem precisa fornecer MIME apropriado: `text/javascript` para módulos e Worker, `text/css` e `application/json`. Use HTTPS; a abertura por `file://` não é suportada.

Links de pesquisa e detalhes usam parâmetros no mesmo caminho, por exemplo `/contratos-web/?tipos_documento=ata&pagina=2`; os parâmetros `detalhe` e `aba` identificam o painel e sua seção. O servidor entrega o mesmo HTML, e a interface restaura a busca e o documento. Esses links não exigem rotas adicionais na hospedagem. Rotas `/api/...` são chamadas diretamente no PNCP; a hospedagem não precisa de reescrita para essas rotas.

## Metadados de indexação e compartilhamento

A página inicial declara canônica, Open Graph e Twitter Cards absolutos apontando para `https://contratos-web.net.br/`. Como a hospedagem estática entrega o mesmo HTML para qualquer parâmetro, a canônica única consolida as URLs de busca e de detalhe (`?tipos_documento=...`, `?detalhe=...`) na página inicial; não é possível aplicar `noindex` somente às variantes. Ao mudar de domínio, atualize `canonical`, `og:url`, `og:image` e `twitter:image` em [`public/index.html`](../public/index.html).

A imagem social fica em `public/og-image.png` (1200×630) e é copiada para a raiz de `dist-browser/` pelo plugin de [`vite.config.js`](../vite.config.js). `pncp-diagnostic.html` declara `noindex, follow` e não deve ser usada como página de entrada.

## GitHub Pages

O workflow [`validate.yml`](../.github/workflows/validate.yml) valida pull requests e publica pushes para `main`, com opção de execução manual. O job `validate` usa Node.js 24, instalação reproduzível, lint, tipos e testes com cobertura, gera os builds de produção e de teste uma vez e confere o orçamento de tamanho. O artefato `browser-builds` é baixado pelos jobs de Chromium e Firefox, executados em paralelo e sem recompilar. O job `deploy` depende da validação e dos dois navegadores, baixa esse mesmo artefato e envia somente `dist-browser/` ao Pages. Depois da publicação, verifica o HTML, a configuração, o Service Worker, a imagem social e os assets no domínio público, comparando conteúdo e tipo HTTP ao build validado. A verificação faz até oito tentativas e não depende do PNCP. Uma falha nessa etapa sinaliza erro depois de o deploy já ter ocorrido. Só `main` é publicada, fora de pull requests; outras branches podem ser validadas manualmente, mas não são publicadas.

O workflow [`webkit.yml`](../.github/workflows/webkit.yml) roda a suíte em WebKit semanalmente ou sob demanda e não publica no Pages.

Para configurar uma publicação:

1. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions**.
2. Envie um commit à `main` ou execute **Actions → Validar e publicar aplicação estática → Run workflow**.
3. Confira o resultado do job `deploy`, inclusive a etapa de verificação do site publicado.
4. Para usar domínio próprio, configure **Custom domain** no Pages, os registros DNS correspondentes e HTTPS.

Sem domínio próprio, um repositório de projeto usa um caminho como `/contratos-web/`. A conta pode exigir aprovação do ambiente `github-pages`; a configuração do workflow concede as permissões de Pages e identidade necessárias à publicação.

O GitHub Pages não interpreta `_headers`. A CSP e a política de referrer do HTML são aplicadas; cabeçalhos HTTP adicionais e controle de cache dependem do provedor.

## Outros provedores e cabeçalhos

Em provedores como Cloudflare Pages, use comando de build `npm run build`, saída `dist-browser` e Node.js 24 para o build. Em Nginx, Apache ou outro servidor, sirva os mesmos arquivos com MIME correto.

O build gera `_headers` com a política de segurança definida em [`vite.config.js`](../vite.config.js). O `sw.js` é registrado somente em HTTPS e mantém em cache apenas os assets com hash em `/assets/*`; HTML, configuração e chamadas ao PNCP continuam indo à rede. O nome do cache recebe um hash dos assets de cada build, e a ativação remove versões anteriores.

- Scripts e Worker da própria origem; conexões à própria origem e a `https://pncp.gov.br`.
- `X-Content-Type-Options: nosniff` e `Referrer-Policy: no-referrer`.
- `Cache-Control: no-cache` para os arquivos e cache imutável de um ano para `/assets/*`.

O servidor de desenvolvimento (`npm run dev`) acrescenta `'unsafe-inline'` a `style-src` e `ws:` a `connect-src`, porque o Vite injeta CSS e o cliente de HMR por WebSocket. O artefato publicado não recebe essas permissões.

Provedores que aceitam `_headers` podem aplicá-lo diretamente na raiz. Em subdiretórios, ajuste a regra de assets para o prefixo publicado. Nos demais servidores, configure cabeçalhos equivalentes. A CSP em `<meta>` não substitui `frame-ancestors 'self'` nem os cabeçalhos da resposta do Worker.

O acesso às APIs exige CORS autorizado pelo PNCP. O transporte usa GET sem credenciais e sem seguir redirecionamentos.

## Verificar e atualizar

Abra `pncp-diagnostic.html` no domínio publicado para conferir o acesso real ao PNCP. O [guia de validação](validacao.md#diagnóstico-do-pncp) explica a matriz de consultas e como salvar o resultado. Confira também busca, links compartilhados, painéis, paginação e CSV nos navegadores usados pelo público.

Atualize HTML, configuração e bundles como um conjunto. Os assets têm nomes com hash; preserve os anteriores temporariamente quando o provedor permitir, para atender abas abertas. HTML e configuração devem ser revalidados. Depois da publicação, abra uma nova aba e repita uma pesquisa.

Para restaurar uma publicação, use HTML, configuração e bundles de um mesmo artefato aprovado, mantendo seus nomes e caminhos, e verifique a aplicação novamente. Ao publicar uma nova versão, o Service Worker ativa um cache com novo hash e remove os caches anteriores; os nomes com hash garantem que o HTML novo referencie os bundles corretos.
