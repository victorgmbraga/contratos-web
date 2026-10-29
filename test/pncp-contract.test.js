import test from 'node:test';
import assert from 'node:assert/strict';
import captures from './fixtures/pncp-options.json' with {type:'json'};
import {PncpClient} from '../src/pncp-core.js';
import {QueryService} from '../src/query-core.js';
import {config} from './helpers.js';

function fixture() {
  const requests=[],cfg=config();
  const client=new PncpClient(cfg,{fetcher:async address=>{
    const url=new URL(address);requests.push(url);
    if(url.pathname==='/api/search/filters')return Response.json(captures.filters);
    if(url.pathname==='/api/search/suggest' && url.searchParams.get('campo')==='fontes')return Response.json(captures.suggestions[url.searchParams.get('tipos_documento')]);
    throw new Error('Endpoint não previsto no contrato PNCP: '+url.pathname);
  }});
  return {service:new QueryService(cfg,client),requests};
}

test('PNCP-CONTRACT-01: filtros reais preservam anos sem id, siglas e rótulos, sem presumir fontes',async()=>{
  const {service}=fixture(),result=await service.domains('edital');
  assert.deepEqual(result.filters.anos,[{id:'9026',label:'9026'},{id:'9020',label:'9020'}]);
  assert.deepEqual(result.filters.ufs,[{id:'SP',label:'SP'},{id:'RS',label:'RS'}]);
  assert.deepEqual(result.filters.modalidades,[{id:'8',label:'Dispensa'},{id:'6',label:'Pregão - Eletrônico'}]);
  assert.deepEqual(result.filters.fontes_orcamentarias,[{id:'2',label:'Municipal'},{id:'4',label:'Federal'}]);
  assert.equal(Object.hasOwn(result.filters,'fontes'),false);
});

test('PNCP-CONTRACT-02: sugestões reais por tipo preservam os IDs dos sistemas e usam campo=fontes',async()=>{
  for(const [type,expected] of [
    ['edital',[{id:'3',label:'Compras.gov.br'},{id:'6',label:'BLL Compras'}]],
    ['contrato',[{id:'3',label:'Compras.gov.br'},{id:'10',label:'Portal de Compras do Estado de Minas Gerais'}]],
  ]) {
    const {service,requests}=fixture();
    assert.deepEqual((await service.suggest(type,'fontes','Compras',20)).items,expected);
    assert.equal(requests[0].origin,'https://pncp.gov.br');assert.equal(requests[0].pathname,'/api/search/suggest');
    assert.deepEqual(Object.fromEntries(requests[0].searchParams),{tipos_documento:type,campo:'fontes',q:'Compras',tam_pagina:'20'});
  }
});
