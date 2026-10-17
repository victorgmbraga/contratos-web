import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeTheme,THEME_STORAGE_KEY} from '../public/theme.js';

function fixture({dark=false,saved=null,blocked=false,loading=false}={}) {
  const events=()=>({listeners:{},addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);},emit(name,event={}){for(const fn of this.listeners[name] || [])fn(event);}});
  const values=new Map(saved===null?[]:[[THEME_STORAGE_KEY,saved]]);
  const storage={getItem:key=>values.get(key)??null,setItem(key,value){if(blocked)throw new Error('Quota');values.set(key,value);}};
  const button={...events(),setAttribute(name,value){this[name]=value;}},tooltip={};
  const document={...events(),readyState:loading?'loading':'complete',documentElement:{dataset:{}},getElementById:id=>id==='theme-button'?button:tooltip};
  const media={...events(),matches:dark};
  const window={...events(),get localStorage(){if(blocked)throw new Error('Storage blocked');return storage;},matchMedia:()=>media};
  initializeTheme({document,window});
  return {document,window,button,tooltip,values,theme:()=>document.documentElement.dataset.theme,system(dark){media.matches=dark;media.emit('change');}};
}

test('THEME-01: acompanha o sistema até uma escolha explícita e salva a alternância',()=>{
  const ui=fixture();assert.equal(ui.theme(),'light');assert.equal(ui.button['aria-pressed'],'false');
  ui.system(true);assert.equal(ui.theme(),'dark');assert.equal(ui.tooltip.textContent,'Ativar modo claro');
  ui.button.emit('click');assert.equal(ui.theme(),'light');assert.equal(ui.values.get(THEME_STORAGE_KEY),'light');
  ui.system(true);assert.equal(ui.theme(),'light');
  ui.button.emit('click');assert.equal(ui.theme(),'dark');assert.equal(ui.button['aria-pressed'],'true');
  assert.equal(ui.values.get(THEME_STORAGE_KEY),'dark');
});

test('THEME-02: escolha salva prevalece sobre o sistema; valores inválidos são ignorados',()=>{
  assert.equal(fixture({dark:true,saved:'light'}).theme(),'light');
  assert.equal(fixture({dark:false,saved:'dark'}).theme(),'dark');
  assert.equal(fixture({dark:true,saved:'invalid'}).theme(),'dark');
});

test('THEME-03: armazenamento bloqueado não impede alternar nem acompanhar o sistema',()=>{
  const ui=fixture({blocked:true});ui.system(true);assert.equal(ui.theme(),'dark');
  ui.button.emit('click');assert.equal(ui.theme(),'light');ui.system(true);assert.equal(ui.theme(),'light');
});

test('THEME-04: tema é aplicado antes do DOM completo e o botão é vinculado ao terminar a leitura',()=>{
  const ui=fixture({loading:true,saved:'dark'});assert.equal(ui.theme(),'dark');
  ui.document.emit('DOMContentLoaded');ui.button.emit('click');assert.equal(ui.theme(),'light');
});

test('THEME-05: sincroniza outras abas e volta ao sistema ao remover a preferência',()=>{
  const ui=fixture({saved:'light',dark:true});
  ui.window.emit('storage',{key:'unrelated',newValue:'dark'});assert.equal(ui.theme(),'light');
  ui.window.emit('storage',{key:THEME_STORAGE_KEY,newValue:'dark'});assert.equal(ui.theme(),'dark');
  ui.window.emit('storage',{key:THEME_STORAGE_KEY,newValue:null});assert.equal(ui.theme(),'dark');
  ui.system(false);assert.equal(ui.theme(),'light');
  ui.window.emit('storage',{key:THEME_STORAGE_KEY,newValue:'dark'});assert.equal(ui.theme(),'dark');
  ui.window.emit('storage',{key:null,newValue:null});assert.equal(ui.theme(),'light');
});
