import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as settle} from 'node:timers/promises';
import {PncpClient} from '../src/pncp-core.js';
import {operation} from '../src/operation.js';
import {config} from './helpers.js';

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
