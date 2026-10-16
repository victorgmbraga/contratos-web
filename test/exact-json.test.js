import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseExactJson, ExactJsonNumber, isExactJsonNumber} from '../src/exact-json.js';
import {plain, scalarText, decimalText} from '../src/adapter.js';

const corpus=JSON.parse(await readFile(new URL('./fixtures/exact-json-corpus.json',import.meta.url),'utf8'));
const represent=value=>isExactJsonNumber(value)?['number',value.toString()]:value===null?['null']:Array.isArray(value)?['array',value.map(represent)]:typeof value==='object'?['object',Object.entries(value).map(([key,item])=>[key,represent(item)])]:[typeof value,value];
test('EXACT-01: corpus independente preserva tokens e rejeições da biblioteca anterior',()=>{
  for(const {input,expected,invalid} of corpus.cases) {
    if(invalid)assert.throws(()=>parseExactJson(input),SyntaxError,input);
    else assert.deepEqual(represent(parseExactJson(input)),expected,input);
  }
});
test('EXACT-02: números são imutáveis e não confundem objetos do PNCP com o tipo interno',()=>{
  const number=parseExactJson('9007199254740993.0000');
  assert(isExactJsonNumber(number));assert.equal(String(number),'9007199254740993.0000');
  assert.throws(()=>Number(number),TypeError);assert(Object.isFrozen(number));
  for(const value of [null,1,'1',{source:'1'},{value:'1',isLosslessNumber:true},Object.create(ExactJsonNumber.prototype)])assert(!isExactJsonNumber(value));
  for(const source of ['01','1.','1e','+1','NaN',1])assert.throws(()=>new ExactJsonNumber(source),SyntaxError);
});
test('EXACT-03: raízes profundas são interpretadas sem estouro da pilha',()=>{
  let value=parseExactJson('['.repeat(20000)+'9007199254740993'+']'.repeat(20000));
  for(let i=0;i<20000;i++)value=value[0];
  assert.equal(String(value),'9007199254740993');
});
test('EXACT-04: chaves especiais são propriedades próprias e não alteram protótipos',()=>{
  const value=parseExactJson('{"__proto__":{"polluted":true},"constructor":12,"toString":false}');
  assert.equal(Object.getPrototypeOf(value),Object.prototype);assert.equal({}.polluted,undefined);
  assert(Object.hasOwn(value,'__proto__'));assert.equal(value.__proto__.polluted,true);
  assert.equal(String(value.constructor),'12');assert.equal(value.toString,false);
});
test('EXACT-05: entradas truncadas e tokens inválidos não são interpretados parcialmente',()=>{
  for(const input of ['[1,,2]','{"a":1 "b":2}','[1}\n','{"a":[1,2]}x','\u00a01','[00]','[1e+]','[.1]','[falsex]','"abc\\','"abc\\"','{"a\\u0000":1, "a\\u0000":2}'])assert.throws(()=>parseExactJson(input),SyntaxError,input);
  for(const input of [null,{},1])assert.throws(()=>parseExactJson(input),TypeError);
});
test('EXACT-06: normalização mantém texto preciso, inteiros seguros e propriedades especiais',()=>{
  const value=parseExactJson('{"small":12,"huge":9007199254740993,"money":0.0000,"science":1.2300e2,"zero":-0,"text":"00012","false":false,"__proto__":{"x":1}}');
  assert.equal(scalarText(value.huge),'9007199254740993');assert.equal(decimalText(value.science),'123.00');
  const result=plain(value);assert.equal(result.small,12);assert.equal(result.huge,'9007199254740993');assert.equal(result.money,'0.0000');assert.equal(result.science,'1.2300e2');assert(Object.is(result.zero,-0));
  assert.equal(result.text,'00012');assert.equal(result.false,false);assert(Object.hasOwn(result,'__proto__'));assert.equal(result.__proto__.x,1);assert.equal(Object.getPrototypeOf(result),Object.prototype);
  assert.deepEqual(structuredClone(result),result);
  let deep=plain(parseExactJson('['.repeat(20000)+'1'+']'.repeat(20000)));
  for(let i=0;i<20000;i++)deep=deep[0];assert.equal(deep,1);
});
