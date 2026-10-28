import test from 'node:test';
import assert from 'node:assert/strict';
import {openOptionsDatabase} from '../src/browser/options-db.js';
import {createFilterOptionsCache} from '../src/browser/filter-options-cache.js';
import {schema} from '../src/schema.js';
import {config} from './helpers.js';

function fixture() {
  const state={mode:'success',closed:0,created:0,values:new Map(),request:null};
  const db={objectStoreNames:{contains:()=>false},createObjectStore(){state.created++;},close(){state.closed++;},transaction(){
    if(state.mode==='throw')throw new Error('Banco fechado');
    const tx={error:null,objectStore(){
      const run=(kind,key,value)=>{
        const request={error:null};
        queueMicrotask(()=>{
          if(state.mode==='request-error'){request.error=new Error('Falha no request');request.onerror();return;}
          request.result=kind==='get'?state.values.get(key):key;request.onsuccess();
          queueMicrotask(()=>{
            if(state.mode==='abort'){tx.onabort();return;}
            if(state.mode==='transaction-error'){tx.error=new Error('Falha na transação');tx.onerror();return;}
            if(kind==='put')state.values.set(key,value);if(kind==='delete')state.values.delete(key);tx.oncomplete();
          });
        });
        return request;
      };
      return {get:key=>run('get',key),put:(value,key)=>run('put',key,value),delete:key=>run('delete',key)};
    }};
    return tx;
  }};
  const indexedDB={open(){const request={result:db};state.request=request;queueMicrotask(()=>{request.onupgradeneeded();request.onsuccess();});return request;}};
  return {state,db,indexedDB};
}

test('OPTIONS-DB-01: leitura, escrita e exclusão só confirmam após a transação concluir',async()=>{
  const f=fixture(),db=await openOptionsDatabase(f.indexedDB);assert.equal(f.state.created,1);
  assert.equal(await db.get('missing'),null);await db.set('key',{filters:{}});assert.deepEqual(await db.get('key'),{filters:{}});
  await db.delete('key');assert.equal(await db.get('key'),null);
  f.db.onversionchange();assert.equal(f.state.closed,1);db.close();assert.equal(f.state.closed,2);
});

test('OPTIONS-DB-02: abortos sem erro de request rejeitam get, set e delete sem confirmar dados',async()=>{
  const f=fixture(),db=await openOptionsDatabase(f.indexedDB);f.state.mode='abort';
  for(const action of [()=>db.get('key'),()=>db.set('key','value'),()=>db.delete('key')])await assert.rejects(action(),e=>e.name==='AbortError');
  assert.equal(f.state.values.size,0);
});

test('OPTIONS-DB-03: erros de request, transação e acesso síncrono não deixam promessas pendentes',async()=>{
  const f=fixture(),db=await openOptionsDatabase(f.indexedDB);
  for(const mode of ['request-error','transaction-error','throw']){f.state.mode=mode;await assert.rejects(db.set('key','value'),Error);}
});

test('OPTIONS-DB-04: abertura indisponível e conexão tardia são descartadas',async()=>{
  assert.equal(await openOptionsDatabase({}),null);assert.equal(await openOptionsDatabase({open(){throw new Error('bloqueado');}}),null);
  for(const event of ['onerror','onblocked']){
    const request={result:{close(){this.closed=true;}}};
    const pending=openOptionsDatabase({open(){queueMicrotask(()=>request[event]());return request;}});assert.equal(await pending,null);
    request.onsuccess();assert.equal(request.result.closed,true);
  }
});

test('OPTIONS-DB-05: falha de persistência libera a fila do cache e preserva o fallback em memória',async()=>{
  const f=fixture();f.state.mode='abort';let calls=0;
  const cache=createFilterOptionsCache({async call(){calls++;return {filters:{ufs:[{id:'SP',label:'São Paulo'}]}};}},schema(config()),{getStorage:()=>null,indexedDB:f.indexedDB});
  try{
    for(const type of ['edital','ata','contrato'])assert.equal((await cache.get({type})).filters.ufs[0].id,'SP');
    assert.equal(calls,3);await cache.get({type:'edital'});assert.equal(calls,3);
  }finally{cache.close();}
});
