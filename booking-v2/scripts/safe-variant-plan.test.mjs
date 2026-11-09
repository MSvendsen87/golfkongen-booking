import test from "node:test";
import assert from "node:assert/strict";
import {
 shiftDay,safeBookingWindow,expectedSku,safeVariantPlan,
 validateStagingVariant
} from "./safe-variant-plan.mjs";

const product={
 id:1474,title:"Booking 2.0 – HYZR halvtimer (KLARGJØRING – IKKE AKTIV)",
 visible:false,price:90,
 variants:[{sku:"2026-11-01-1000-1030",price:90,qty:0}]
};
test("45-day window honors Oslo launch date and year boundaries",()=>{
 const a=safeBookingWindow("2026-10-26");
 assert.equal(a.start,"2026-11-01");
 assert.equal(a.end,"2026-12-10");
 assert.equal(a.dates.length,40);
 const b=safeBookingWindow("2026-12-30");
 assert.equal(b.dates.length,46);
 assert.equal(b.end,"2027-02-13");
 assert.equal(shiftDay("2026-12-31",1),"2027-01-01");
});
test("variant SKU always encodes exact ISO day and 30-min boundaries",()=>{
 assert.equal(expectedSku("2026-11-02",600,30),"2026-11-02-1000-1030");
 assert.equal(expectedSku("2026-11-02",600,240),"2026-11-02-1000-1400");
 assert.throws(()=>expectedSku("2026-02-30",600,30));
 assert.throws(()=>expectedSku("2026-11-02",610,30));
 assert.throws(()=>expectedSku("2026-11-02",1310,60));
});
test("planner never recreates an existing slot and always stages with zero stock",()=>{
 const items=safeVariantPlan({
  product,resource:"hyzr",minutes:30,dates:["2026-11-01"],limit:40
 });
 assert.equal(items.length,23);
 assert.equal(items.some(v=>v.sku==="2026-11-01-1000-1030"),false);
 assert.ok(items.every(v=>v.qty===0&&v.preorder===0&&v.price===90));
 assert.equal(new Set(items.map(x=>x.sku)).size,items.length);
});
test("newest day gets priority and cap applies to actual absent variants",()=>{
 const a=safeVariantPlan({
  product,resource:"hyzr",minutes:30,
  dates:["2026-11-02","2026-11-01"],limit:2
 });
 assert.equal(a.length,2);
 assert.equal(a[0].sku,"2026-11-02-1000-1030");
 assert.equal(a[1].sku,"2026-11-02-1030-1100");
 assert.deepEqual(safeVariantPlan({product,resource:"hyzr",minutes:30,dates:["2026-11-02"],limit:0}),[]);
});
test("rejects unknown parent visibility, even if other fields look correct",()=>{
 for(const visible of [null,true,1,"1",undefined]){
  assert.throws(()=>safeVariantPlan({
   product:{...product,visible},resource:"hyzr",minutes:30,dates:["2026-11-02"]
  }),/staging_product_visibility_not_verified/);
 }
 assert.throws(()=>safeVariantPlan({
  product,resource:"venue",minutes:30,dates:["2026-11-02"]
 }),/invalid_variant_plan/);
});
test("readback acceptance requires correct SKU, price, hidden state, zero stock",()=>{
 const good={sku:"2026-11-02-1000-1030",stock:0,hidden:true,
  price:90,preorder:false,allowMinusQty:false};
 assert.equal(validateStagingVariant({parent:product,variant:good,sku:good.sku,price:90}).safe,true);
 const bad={...good,hidden:false,stock:5,preorder:true};
 const report=validateStagingVariant({parent:product,variant:bad,sku:good.sku,price:90});
 assert.equal(report.safe,false);
 assert.deepEqual(report.errors.filter(x=>["variant_not_hidden","stock_not_zero","preorder_enabled"].includes(x)).sort(),["preorder_enabled","stock_not_zero","variant_not_hidden"]);
});
test("hidden parent does not allow a visible variant to pass verification",()=>{
 const bad={sku:"2026-11-02-1000-1030",qty:0,hidden:false,price:90,preorder:0};
 assert.equal(validateStagingVariant({parent:product,variant:bad,sku:bad.sku,price:90}).safe,false);
});
