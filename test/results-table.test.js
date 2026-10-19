import test from 'node:test';
import assert from 'node:assert/strict';
import {paginationPages} from '../public/results-table.js';
test('TABLE-PAGES-01: navegação inclui a página confirmada sem sair da janela acessível',()=>{
  assert.deepEqual(paginationPages(1,1),[1]);assert.deepEqual(paginationPages(1,2),[1,2]);
  assert.deepEqual(paginationPages(1,100),[1,2,3,4,5]);assert.deepEqual(paginationPages(50,100),[48,49,50,51,52]);assert.deepEqual(paginationPages(100,100),[96,97,98,99,100]);
  for(let last=1;last<=100;last++)for(let page=1;page<=last;page++) {
    const pages=paginationPages(page,last);
    assert(pages.includes(page));assert.equal(pages.length,Math.min(5,last));
    assert(pages[0]>=1 && pages.at(-1)<=last);
    assert.equal(new Set(pages).size,pages.length);
  }
});
