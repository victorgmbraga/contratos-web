import test from 'node:test';
import assert from 'node:assert/strict';
import {createColumnLayout,COLUMN_LAYOUT_PREFIX} from '../public/column-layout.js';
import {memoryStorage} from './helpers.js';

test('COLUMN-LAYOUT-01: layout válido permanece disponível; entradas inválidas são removidas isoladamente',()=>{
  const storage=memoryStorage(),layout=createColumnLayout({window:{localStorage:storage},state:{query:{document_type:'edital'}}});
  layout.save([{field:'titulo',visible:true,width:180}]);assert.deepEqual(layout.read('edital'),{order:['titulo'],visible:{titulo:true},width:{titulo:180}});
  const valid=storage.getItem(COLUMN_LAYOUT_PREFIX+'edital');
  for(const raw of ['invalid','null','[]','{}',JSON.stringify({order:[],visible:[],width:{}}),JSON.stringify({order:[],visible:{},width:{titulo:0}})]){
    storage.setItem(COLUMN_LAYOUT_PREFIX+'ata',raw);assert.equal(layout.read('ata'),null);assert.equal(storage.getItem(COLUMN_LAYOUT_PREFIX+'ata'),null);assert.equal(storage.getItem(COLUMN_LAYOUT_PREFIX+'edital'),valid);
  }
  layout.clear('edital');assert.equal(layout.read('edital'),null);
});

test('COLUMN-LAYOUT-02: persistência bloqueada, layout inválido e estado sem consulta não impedem o uso',()=>{
  const blocked=createColumnLayout({window:{get localStorage(){throw new Error('blocked');}},state:{query:{document_type:'edital'}}});
  assert.equal(blocked.read('edital'),null);blocked.clear('edital');blocked.save([{field:'titulo',visible:true,width:180}]);
  const storage=memoryStorage(),state={query:null},layout=createColumnLayout({window:{localStorage:storage},state});
  layout.save([{field:'titulo',visible:true,width:180}]);assert.equal(storage.data.size,0);
  state.query={document_type:'edital'};layout.save([{field:'titulo',visible:true,width:NaN}]);assert.equal(storage.data.size,0);
});
