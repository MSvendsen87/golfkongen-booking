import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubCapacityForDay,loadClubCapacity} from './club-priority.mjs';
const product=(qty=10)=>({id:1322,title:'LDK Tilgang',variants:[{id:55,qty,values:[{val:'Torsdag 05.11'}]}]});
test('existing capacity and one signup',()=>{
 assert.deepEqual(clubCapacityForDay(product(),'2026-11-05'),{remaining:10,variantId:55});
 assert.equal(clubCapacityForDay({product:product(9)},'2026-11-05').remaining,9);
});
test('unknown, malformed, duplicates and other dates fail closed',()=>{
 for(const q of [null,undefined,'',-1,11,9.5,'oops']){const p=product();p.variants[0].qty=q;assert.throws(()=>clubCapacityForDay(p,'2026-11-05'));}
 const p=product();p.variants.push(p.variants[0]);assert.throws(()=>clubCapacityForDay(p,'2026-11-05'));
 for(const d of ['2026-11-06','2026-11-12'])assert.throws(()=>clubCapacityForDay(product(),d));
 assert.throws(()=>clubCapacityForDay({...product(),id:1321},'2026-11-05'));
});
test('year boundary matches explicit year and excludes another year',()=>{
 const p=product();p.variants[0].values[0].val='Torsdag 07.01.2027';
 assert.equal(clubCapacityForDay(p,'2027-01-07').remaining,10);
 p.variants[0].values[0].val='Torsdag 07.01.2026';assert.throws(()=>clubCapacityForDay(p,'2027-01-07'));
});
test('only supported product GET; errors are not empty registration',async()=>{
 const p=await loadClubCapacity('2026-11-05',{apiKey:'test-only-key',fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://api.quickbutik.com/v1/products?product_id=1322&include_details=true');
  assert.equal(opts.method,undefined);assert.equal(opts.cache,'no-store');
  return {ok:true,json:async()=>product()};
 }});assert.equal(p.remaining,10);
 await assert.rejects(loadClubCapacity('2026-11-05',{apiKey:'test-only-key',fetchImpl:async()=>({ok:false})}));
});
