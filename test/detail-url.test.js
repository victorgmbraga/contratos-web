import test from 'node:test';
import assert from 'node:assert/strict';
import { readDetailUrl, writeDetailUrl, detailTabs, detailDocumentPath } from '../src/browser/detail-url.js';
import { readQueryUrl, writeQueryUrl } from '../src/browser/query-url.js';
import { schema } from '../src/schema.js';
import { config } from './helpers.js';
const base='https://example.test/contratos-web/?demo=1&q=engenharia&ufs=DF&pagina=2#resultados';
const documents=['edital','ata','contrato'].map(type=>({type,cnpj:'01234567000189',ano:'2025',sequencial:'90071992547409931',...(type==='ata'?{sequencial_compra:'57'}:{})}));

test('DETAIL-URL-01: todos os tipos e abas preservam identidade, busca, página e fragmento',()=>{
  for(const document of documents)for(const tab of detailTabs(document.type)) {
    const selection={document,tab},href=writeDetailUrl(base,selection);
    assert.deepEqual(readDetailUrl(href),selection);assert.equal(writeDetailUrl(href,selection),href);
    const url=new URL(href);assert.equal(url.pathname,'/contratos-web/');assert.equal(url.searchParams.get('demo'),'1');assert.equal(url.searchParams.get('q'),'engenharia');assert.equal(url.searchParams.get('ufs'),'DF');assert.equal(url.searchParams.get('pagina'),'2');assert.equal(url.hash,'#resultados');
  }
});
test('DETAIL-URL-02: sem seleção retorna null, aba ausente usa detalhes e sequenciais são normalizados sem perder precisão',()=>{
  assert.equal(readDetailUrl(base),null);
  const selection=readDetailUrl('https://example.test/?detalhe=ata/01234567000189/2025/000057/000009');
  assert.deepEqual(selection,{document:{type:'ata',cnpj:'01234567000189',ano:'2025',sequencial:'9',sequencial_compra:'57'},tab:'detalhes'});
  assert.equal(detailDocumentPath(selection.document),'ata/01234567000189/2025/57/9');
});
test('DETAIL-URL-03: fechar remove somente os parâmetros do painel',()=>{
  const href=writeDetailUrl(base,{document:documents[0],tab:'itens'}),closed=writeDetailUrl(href,null);
  assert.equal(closed,base);assert.equal(readDetailUrl(closed),null);
});
test('DETAIL-URL-04: inválidos e abas incompatíveis são rejeitados',()=>{
  for(const suffix of ['?aba=itens','?detalhe=','?detalhe=edital/01234567000189/2025/1&aba=','?detalhe=irp/01234567000189/2025/1','?detalhe=edital/123/2025/1','?detalhe=edital/01234567000189/25/1','?detalhe=edital/01234567000189/2025/0','?detalhe=edital/01234567000189/2025/-1','?detalhe=edital/01234567000189/2025/1e2','?detalhe=ata/01234567000189/2025/9','?detalhe=ata/01234567000189/2025/0/9','?detalhe=contrato/01234567000189/2025/1&aba=itens','?detalhe=ata/01234567000189/2025/57/9&aba=empenhos','?detalhe=edital/01234567000189/2025/1&aba=termos','?detalhe=edital/01234567000189/2025/1/extra','?detalhe=https://other.test/','?detalhe=edital/01234567000189/2025/../1','?detalhe=edital/01234567000189/2025/1&detalhe=edital/01234567000189/2025/2','?detalhe=edital/01234567000189/2025/1&aba=itens&aba=detalhes','?detalhe=edital/01234567000189/2025/'+ '1'.repeat(257)])assert.throws(()=>readDetailUrl('https://example.test/'+suffix),undefined,suffix);
});
test('DETAIL-URL-05: detalhes são independentes da validação e serialização da busca',()=>{
  const definition=schema(config()),query=readQueryUrl(base,definition),selection={document:documents[2],tab:'historico'};
  const href=writeDetailUrl(writeQueryUrl(base,query,definition),selection);
  assert.deepEqual(readQueryUrl(href,definition),query);assert.deepEqual(readDetailUrl(href),selection);
});
