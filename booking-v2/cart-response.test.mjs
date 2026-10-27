import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
// Exercise the actual shipped browser validator, without a duplicate implementation.
const html=readFileSync(new URL('../docs/booking/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function validateQuickbutikCartAdd('),html.indexOf('async function quickbutikAddProduct('));
const validate=runInNewContext(source+';validateQuickbutikCartAdd');
const sku='2026-11-04-1000-1030';
const booking=()=>({success:1,items:[{is_variant:1,qty:1,item:{raw_id:282560,sku}}]});
test('accepts exact booking variant and rental response format',()=>{
 assert.equal(validate(booking(),1474,282560,1,sku),true);
 assert.equal(validate({success:1,items:[{is_variant:0,qty:2,item:{raw_id:1318,sku:'1318'}}]},1318,null,2,'1318'),true);
});
test('rejects HTTP-success payloads without successful cart evidence',()=>{
 for(const cart of [null,{}, {success:0,items:[]},{success:1,items:[]}])
  assert.throws(()=>validate(cart,1474,282560,1,sku));
});
test('rejects wrong time, quantity, product, variant type and duplicate lines',()=>{
 for(const mutate of [
  c=>c.items[0].item.sku='2026-11-04-1030-1100',
  c=>c.items[0].qty=2,
  c=>c.items[0].item.raw_id=999,
  c=>c.items[0].is_variant=0,
  c=>c.items.push(c.items[0])
 ]) {const cart=booking();mutate(cart);assert.throws(()=>validate(cart,1474,282560,1,sku));}
});
