import test from "node:test";
import assert from "node:assert/strict";
import {mutateHeldCartVariant,stateFromV1} from "./quickbutik-cart-variant.mjs";

const sku="2026-11-04-1000-1030";
const makeMock=({stock=0,hidden=1,title="Booking 2.0 – HYZR",price=90}={})=>{
 let product={id:1474,title,visible:0,price,variants:[
  {id:282560,sku,price,qty:stock,hidden}
 ]},writes=0;
 const fetchImpl=async(url,{method,body}={})=>{
  if(method==="GET")return {ok:true,json:async()=>({product})};
  if(method==="PUT"){
   writes++;
   const x=JSON.parse(body);
   if(x.length!==1||x[0].product_id!==1474||x[0].variant_id!==282560)
    throw Error("unexpected product mutation");
   product.variants[0].qty=x[0].stock;
   product.variants[0].hidden=x[0].visible===1?null:1;
   return {ok:true,json:async()=>({success:1})};
  }
  throw Error("unsupported");
 };
 return {fetchImpl,get writes(){return writes},get product(){return product}};
};
const run=(mock,action)=>mutateHeldCartVariant({
 productId:1474,sku,action,apiKey:"secure-test-key-only",fetchImpl:mock.fetchImpl
});
test("legacy V1 visible:null is an OPEN variant, hidden:1 is CLOSED",()=>{
 const base={variants:[{id:5,sku,price:"90.00",qty:"0",hidden:1}]};
 const s=stateFromV1(base,sku);
 assert.equal(s.hidden,true);assert.equal(s.visible,false);
 base.variants[0].hidden=null;base.variants[0].qty="1";
 const live=stateFromV1(base,sku);
 assert.equal(live.hidden,false);assert.equal(live.visible,true);
});
test("open only exact hidden SKU and then close it; both updates are verified",async()=>{
 const m=makeMock();
 const opened=await run(m,"open");
 assert.equal(opened.opened,true);
 assert.equal(m.product.variants[0].qty,1);
 assert.equal(m.product.variants[0].hidden,null);
 const closed=await run(m,"close");
 assert.equal(closed.closed,true);
 assert.equal(m.product.variants[0].qty,0);
 assert.equal(m.product.variants[0].hidden,1);
 assert.equal(m.writes,2);
});
test("replay of already-open or already-closed state does not write",async()=>{
 const m=makeMock({stock:1,hidden:null});
 assert.equal((await run(m,"open")).alreadyOpen,true);
 assert.equal(m.writes,0);
 const closed=await run(m,"close");
 assert.equal(closed.closed,true);
 assert.equal((await run(m,"close")).alreadyClosed,true);
 assert.equal(m.writes,1);
});
test("unknown SKU, wrong product, missing quantity and unexpectedly live slot fail closed",async()=>{
 await assert.rejects(run(makeMock({stock:1,hidden:1}),"open"),/variant_not_safely_staged/);
 await assert.rejects(run(makeMock({title:"Ordinary shop item"}),"open"),/not_authorized_booking_product/);
 await assert.rejects(run(makeMock({stock:4,hidden:null}),"close"),/unexpected_variant_inventory/);
 const m=makeMock();delete m.product.variants[0].qty;
 await assert.rejects(run(m,"open"),/invalid_booking_variant/);
});
test("never accept a browser-specified product ID outside the private 33 mapped products",async()=>{
 await assert.rejects(mutateHeldCartVariant({
  productId:1316,sku,action:"open",apiKey:"secure-test-key-only",fetchImpl:makeMock().fetchImpl
 }),/invalid_checkout_variant_request/);
});
test("unexpected API mutation response never claims a confirmed slot",async()=>{
 const m=makeMock();
 const mock=async(url,options)=>options.method==="PUT"?{ok:true,json:async()=>({success:0})}:m.fetchImpl(url,options);
 await assert.rejects(mutateHeldCartVariant({
  productId:1474,sku,action:"open",apiKey:"secure-test-key-only",fetchImpl:mock
 }),/quickbutik_variant_write_rejected/);
});
