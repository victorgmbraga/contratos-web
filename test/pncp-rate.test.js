import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as settle} from 'node:timers/promises';
import {PncpClient} from '../src/pncp-core.js';
import {operation} from '../src/operation.js';
import {config} from './helpers.js';

test('RATE-04: retentativas HTTP liberam a vaga durante a espera e preservam a pausa global de 429',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:10000});
  for(const status of [502,503,504,429]){
    const start=Date.now(),starts=[],cfg=config({PNCP_MAX_CONCURRENT_REQUESTS:1,PNCP_MAX_RETRIES:1});let attempts=0;
    const client=new PncpClient(cfg,{fetcher:async url=>{
      starts.push({url,at:Date.now()});
      return url.endsWith('/background') && attempts++===0?new Response(null,{status,headers:{'Retry-After':'5'}}):Response.json({ok:true});
    }});
    const background=operation(cfg,undefined,undefined,'background'),foreground=operation(cfg);
    try{
      const back=client.get('https://pncp.gov.br/background',background);await settle();
      assert.equal(client.active,0,'A espera HTTP não ocupa uma vaga');
      const front=client.get('https://pncp.gov.br/foreground',foreground);await settle();t.mock.timers.tick(1);await settle();
      assert.equal(starts.length,status===429?1:2);
      if(status!==429){assert.equal(starts[1].at,start+1);await front;}
      t.mock.timers.tick(4999);await settle();t.mock.timers.tick(1);await settle();await Promise.all([back,front]);
      assert.equal(client.active,0);assert.equal(client.queue.length,0);
      if(status===429)assert(starts.slice(1).every(call=>call.at>=start+5000));
    }finally{background.finish();foreground.finish();}
  }
});

test('RATE-05: cancelar durante Retry-After encerra a espera e não executa outra tentativa',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:10000});
  const cfg=config({PNCP_MAX_RETRIES:1}),controller=new AbortController(),op=operation(cfg,controller.signal);let calls=0;
  const client=new PncpClient(cfg,{fetcher:async()=>{calls++;return new Response(null,{status:503,headers:{'Retry-After':'5'}});}});
  try{
    const pending=client.get('https://pncp.gov.br/test',op),rejected=assert.rejects(pending,error=>error.name==='AbortError');await settle();
    assert.equal(client.active,0);controller.abort();await rejected;t.mock.timers.tick(5000);await settle();assert.equal(calls,1);assert.equal(client.queue.length,0);
  }finally{op.finish();}
});

// A fixed clock verifies request starts without timing-sensitive wall-clock assertions.
test('RATE-01: cancelar durante a espera não adia o início das próximas chamadas',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:10000});
  const cfg=config({PNCP_REQUESTS_PER_SECOND:1}),starts=[];
  const client=new PncpClient(cfg,{fetcher:async()=>{starts.push(Date.now());return Response.json({ok:true});}});
  const first=operation(cfg),cancel=new AbortController(),waiting=operation(cfg,cancel.signal),next=operation(cfg);
  try{
    const initial=client.get('https://pncp.gov.br/test',first);await settle();t.mock.timers.tick(0);await settle();await initial;
    const abandoned=client.get('https://pncp.gov.br/test',waiting),rejected=assert.rejects(abandoned,error=>error.name==='AbortError');await settle();cancel.abort();await rejected;
    const pending=client.get('https://pncp.gov.br/test',next);await settle();
    t.mock.timers.tick(999);await settle();assert.equal(starts.length,1);
    t.mock.timers.tick(1);await settle();assert.deepEqual(starts,[10000,11000]);await pending;
  }finally{cancel.abort();first.finish();waiting.finish();next.finish();}
});

test('RATE-03: operações de primeiro plano passam à frente da pré-carga em segundo plano',async()=>{
  const cfg=config({PNCP_MAX_CONCURRENT_REQUESTS:1}),client=new PncpClient(cfg,{fetcher:async()=>Response.json({ok:true})});
  const first=operation(cfg),background=operation(cfg,undefined,undefined,'background'),foreground=operation(cfg,undefined,undefined,'foreground'),order=[];
  try{
    await client.acquire(first.signal);
    const queuedBackground=client.acquire(background.signal,'background').then(()=>order.push('background'));
    const queuedForeground=client.acquire(foreground.signal,'foreground').then(()=>order.push('foreground'));
    await settle();assert.deepEqual(order,[]);
    client.release();await queuedForeground;assert.deepEqual(order,['foreground']);
    client.release();await queuedBackground;assert.deepEqual(order,['foreground','background']);
  }finally{first.finish();background.finish();foreground.finish();}
});

test('RATE-02: chamadas já em espera respeitam Retry-After recebido por outra operação',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:10000});
  const cfg=config({PNCP_REQUESTS_PER_SECOND:1}),starts=[];let finishLimited;
  const client=new PncpClient(cfg,{fetcher:async()=>{
    starts.push(Date.now());
    if(starts.length===1)return new Promise(resolve=>{finishLimited=()=>resolve(new Response(null,{status:429,headers:{'Retry-After':'5'}}));});
    return Response.json({ok:true});
  }});
  const first=operation(cfg),next=operation(cfg);
  try{
    const limited=client.get('https://pncp.gov.br/test',first),rejected=assert.rejects(limited,error=>error.code==='PNCP_UNAVAILABLE');
    await settle();t.mock.timers.tick(0);await settle();
    const pending=client.get('https://pncp.gov.br/test',next);await settle();finishLimited();await rejected;
    t.mock.timers.tick(1000);await settle();assert.equal(starts.length,1);
    t.mock.timers.tick(4000);await settle();assert.deepEqual(starts,[10000,15000]);await pending;
  }finally{first.finish();next.finish();}
});
