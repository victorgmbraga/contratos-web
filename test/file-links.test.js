import test from 'node:test';
import assert from 'node:assert/strict';
import {safeFileLink,safeLink} from '../src/adapter.js';
import {service,json} from './helpers.js';

const path='/pncp-api/v1/orgaos/01234567000189/compras/2026/1/arquivos/1';

test('FILE-LINK-01: remove portas internas variáveis do PNCP sem alterar o restante da URL',()=>{
  for(const protocol of ['http:','https:'])for(const port of ['52210','53123','65535']){
    const suffix=path+'?nome=Anexo%20I.pdf&token=a%2Fb%3Dc&porta=52210#pagina=2';
    const original=`${protocol}//pncp.gov.br:${port}${suffix}`,expected=`${protocol}//pncp.gov.br${suffix}`;
    assert.equal(safeFileLink(original),expected);
    assert.equal(safeFileLink(safeFileLink(original)),expected,'A normalização é idempotente');
  }
  assert.equal(safeFileLink('https://PNCP.GOV.BR:52210/api/pncp/v1/orgaos/01234567000189/contratos/2026/1/arquivos/2'),'https://pncp.gov.br/api/pncp/v1/orgaos/01234567000189/contratos/2026/1/arquivos/2');
});

test('FILE-LINK-02: links corrigidos na fonte, portas padrão e endereços externos continuam válidos',()=>{
  for(const original of [
    'https://pncp.gov.br'+path,
    'http://pncp.gov.br'+path,
    'https://pncp.gov.br:443'+path,
    'http://pncp.gov.br:80'+path,
    'https://arquivos.example.gov.br:8443/documento.pdf?porta=52210',
    'https://pncp.gov.br.example.com:52210/documento.pdf',
    'https://arquivos.pncp.gov.br:8443/documento.pdf'
  ])assert.equal(safeFileLink(original),safeLink(original));
  assert.equal(safeLink('https://pncp.gov.br:8443/sistema-origem'),'https://pncp.gov.br:8443/sistema-origem','Links genéricos não recebem o tratamento de arquivos');
});

test('FILE-LINK-03: a correção preserva a rejeição de URLs inválidas, protocolos inseguros e credenciais',()=>{
  for(const value of [null,undefined,'',false,{},'invalid','javascript:alert(1)','data:text/html,test','ftp://pncp.gov.br:52210/file','https://user:password@pncp.gov.br:52210'+path,'https://pncp.gov.br:65536'+path])assert.equal(safeFileLink(value),null);
});

test('FILE-LINK-04: arquivos dos três tipos de documento e de termos de contrato usam a normalização',async()=>{
  const original='https://pncp.gov.br:52210'+path,expected='https://pncp.gov.br'+path;
  const s=service([],{handler:url=>json(url.pathname.endsWith('/quantidade')?1:[{titulo:'Anexo.pdf',url:original}])});
  const base={cnpj:'01234567000189',ano:'2026',sequencial:'1'};
  for(const document of [{type:'edital',...base},{type:'ata',...base,sequencial_compra:'1'},{type:'contrato',...base}]){
    const result=await s.service.documentRelated(document,'arquivos',1,10);assert.equal(result.data[0].url,expected);
  }
  const terms=await s.service.contractChild({type:'contrato',...base},'termos','1');assert.equal(terms.files[0].url,expected);
  assert(s.requests.every(url=>url.port===''),'As consultas de metadados continuam usando as APIs públicas');
});
