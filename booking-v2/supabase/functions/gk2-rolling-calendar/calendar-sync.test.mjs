import test from 'node:test';import assert from 'node:assert/strict';
import {syncCalendar,slotsForDay,advance} from './calendar-sync.mjs';
const plan={productId:1474,resource:'hyzr',minutes:30,firstDay:'2026-12-16',targetDay:'2026-12-16',bookableThrough:'2026-12-13'};
function shop({uncertain=false}={}){
 let id=100;const product={id:1474,title:'Booking 2.0 HYZR',price:75,visible:null,variants:[{id:1,sku:'2026-11-01-1000-1030',price:75,qty:1,hidden:null}]};let writes=0;
 return {product,get writes(){return writes;},fetchImpl:async(url,req)=>{
  if(req.method==='GET')return Response.json(structuredClone(product));
  writes++;const [body]=JSON.parse(req.body);
  if(body.variants){for(const v of body.variants.add)product.variants.push({...v,id:id++,hidden:null});if(uncertain&&writes===1)throw Error('timeout');}
  else for(const update of JSON.parse(req.body)){const v=product.variants.find(v=>v.id===update.variant_id);v.qty=update.stock;v.hidden=update.visible===0?1:null;}
  return Response.json({success:1});
 }};
}
test('creates missing future day hidden at zero stock, retains live cart, rerun does not write',async()=>{
 const mock=shop();const options={apiKey:'test-key-with-at-least-20-characters',fetchImpl:mock.fetchImpl};
 const first=await syncCalendar(plan,options);assert.equal(first.complete,true);assert.equal(first.created,30);
 assert.equal(mock.product.variants[0].qty,1);assert.equal(mock.product.variants[0].hidden,null);
 assert(mock.product.variants.slice(1).every(v=>v.qty===0&&v.hidden===1));
 const writes=mock.writes;const second=await syncCalendar(plan,options);assert.equal(second.created,0);assert.equal(mock.writes,writes);
});
test('uncertain add stops; next run repairs future zero-stock variants without duplicate SKUs',async()=>{
 const mock=shop({uncertain:true});const options={apiKey:'test-key-with-at-least-20-characters',fetchImpl:mock.fetchImpl};
 await assert.rejects(syncCalendar(plan,options),/timeout/);assert.equal(mock.writes,1);
 const result=await syncCalendar(plan,options);assert.equal(result.created,5);assert.equal(result.repaired,25);assert.equal(result.complete,true);
});
test('bounded writes and duplicate SKU rejection',async()=>{
 const mock=shop();const options={apiKey:'test-key-with-at-least-20-characters',fetchImpl:mock.fetchImpl,maxNew:5};
 const result=await syncCalendar(plan,options);assert.equal(result.created,5);assert.equal(result.remaining,25);
 mock.product.variants.push({...mock.product.variants[0]});await assert.rejects(syncCalendar(plan,options),/duplicate/);
});
test('Oslo date ranges cross month/year and starts fit the closing time',()=>{
 assert.equal(advance('2026-12-31',1),'2027-01-01');
 const halfHours=slotsForDay(plan.firstDay,30);
 assert.equal(halfHours[0].sku,'2026-12-16-0800-0830');
 assert.equal(halfHours.at(-1).sku,'2026-12-16-2230-2300');
 const venue=slotsForDay(plan.firstDay,720);
 assert.equal(venue.length,7);
 assert.equal(venue.at(-1).sku,'2026-12-16-1100-2300');
});
test('recovers only unavailable zero-stock times on a bookable date',async()=>{
 const mock=shop();
 mock.product.variants.push(
  {id:2,sku:'2026-12-16-0800-0830',price:75,qty:0,hidden:null},
  {id:3,sku:'2026-12-16-1000-1030',price:75,qty:0,hidden:null}
 );
 const config={apiKey:'test-key-with-at-least-20-characters',fetchImpl:mock.fetchImpl};
 const result=await syncCalendar({...plan,bookableThrough:plan.firstDay,
  openingHoursByWeekday:{3:{from:600,to:1320}}},config);
 assert.equal(result.repaired,1);
 assert.equal(result.complete,true);
 assert.equal(mock.product.variants.find(v=>v.id===2).hidden,1);
 assert.equal(mock.product.variants.find(v=>v.id===3).hidden,null);
});
