import test from 'node:test';
import assert from 'node:assert/strict';
import { service,document,query,csvBytes } from './helpers.js';

test('EXP-01: nova coleta completa sem recorte da página visível',async()=>{
  const s=service(Array.from({length:12},(_,i)=>document(i+1)));await s.service.execute(query({page:2}));const previous=s.requests.length;const r=await s.service.export(query({page:2}));assert.equal(r.metadata.exported_rows,12);assert.equal(s.requests.length-previous,2);assert.equal(csvBytes(r).subarray(0,3).toString('hex'),'efbbbf');assert.equal(csvBytes(r).toString().split('\r\n').length,14);assert(!csvBytes(r).toString().includes('"categorizacao"'));
});
test('EXP-01B: exportação usa páginas de 100 por padrão',async()=>{
  const s=service(Array.from({length:12},(_,i)=>document(i+1)),{}, {PNCP_EXPORT_PAGE_SIZE:100});
  const r=await s.service.export(query());assert.equal(r.metadata.exported_rows,12);assert.equal(s.requests.length,1);assert.equal(r.metadata.export_scope,'all');
});

test('EXP-01C: escopo page exporta somente a página atual',async()=>{
  const s=service(Array.from({length:12},(_,i)=>document(i+1)));
  const r=await s.service.export(query({page:2}),null,null,{scope:'page'});
  assert.equal(r.metadata.exported_rows,2);assert.equal(r.metadata.page,2);assert.equal(r.metadata.export_scope,'page');assert.equal(r.metadata.collection_complete,false);assert.equal(s.requests.length,1);
  assert.equal(csvBytes(r).toString().split('\r\n').length,4);
});

test('EXP-02: última página falha ou buffer excede não devolve CSV parcial',async()=>{
  const docs=Array.from({length:12},(_,i)=>document(i+1));
  const s=service(docs,{handler:u=>u.searchParams.get('pagina')==='2'?new Response('<html>erro</html>',{headers:{'Content-Type':'text/html'}}):null});await assert.rejects(s.service.export(query()),e=>e.code==='INVALID_UPSTREAM');
  const small=service(docs,{}, {PNCP_MAX_EXPORT_BYTES:10});await assert.rejects(small.service.export(query()),e=>e.code==='EXPORT_BYTES_LIMIT');
  const empty=service([],{}, {PNCP_MAX_EXPORT_BYTES:10});await assert.rejects(empty.service.export(query()),e=>e.code==='EXPORT_BYTES_LIMIT');
});

test('EXP-06: exportar página preserva o recorte exibido com tamanho de coleta diferente',async()=>{
  const docs=Array.from({length:225},(_,i)=>document(i+1));
  for(const [size,collectSize,page]of [[100,50,2],[100,10,3],[25,100,2]]){
    const s=service(docs,{}, {PNCP_EXPORT_PAGE_SIZE:collectSize}),input=query({size,page});
    const displayed=await s.service.execute(input),result=await s.service.export(input,null,null,{scope:'page'});
    const csv=csvBytes(result).toString();
    assert.equal(result.metadata.size,size);assert.equal(result.metadata.exported_rows,displayed.data.length);
    const received=s.requests.at(-1);assert.equal(received.searchParams.get('tam_pagina'),String(size));assert.equal(received.searchParams.get('pagina'),String(page));
    for(const row of displayed.data)assert(csv.includes('"'+row.objeto_compra+'"'));
  }
});
test('EXP-03: mudanças, duplicatas e páginas incompletas abortam a exportação',async()=>{
  const docs=Array.from({length:12},(_,i)=>document(i+1));
  for(const second of [{items:docs.slice(10),total:13},{items:docs.slice(0,2),total:12},{items:[],total:12}]) {
    const s=service(docs,{handler:u=>u.searchParams.get('pagina')==='2'?Response.json(second):null});
    await assert.rejects(s.service.export(query()),e=>e.code==='SOURCE_CHANGED');
  }
});
test('EXP-04: aspas e quebras escapadas; decimal sem moeda',async()=>{
  const s=service([document(1,{description:'Texto "com aspas"\nLinha 2',valor_total_estimado:'2.25'})]);const r=await s.service.export(query());const csv=csvBytes(r).toString();assert(csv.includes('"Texto ""com aspas""\nLinha 2"'));assert(csv.includes('"2.25"'));assert(!csv.includes('R$'));
});

test('EXP-05: textos não são fórmulas ao abrir o CSV; valores monetários negativos mantêm precisão',async()=>{
  for(const text of ['=1+1','+SUM(1,2)','-1+2','@SUM(1,2)',' \t=1+1','\r\n@SUM(1,2)']){
    const s=service([document(1,{title:text,description:text,valor_total_estimado:'-9007199254740993.12345'})]);
    const csv=csvBytes(await s.service.export(query())).toString();
    assert(csv.includes('"\''+text+'"'),text);assert(csv.includes('"-9007199254740993.12345"'));
  }
});
