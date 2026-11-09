import test from "node:test";
import assert from "node:assert/strict";
import {verifyV1Net as v} from "../supabase/functions/gk2-hyzr-order-net/v1-net-core.mjs";
const c={unpriced:true,orderNumber:"3776",customerEmail:"user@example.com",slotDate:"2026-11-09",startMin:720,endMin:780};
const order={order_id:3776,status:1,currency:"NOK",shipping_amount:"0.00",refunds:[],customer:{email:"user@example.com"},
 products:[{product_id:1477,sku:"2026-11-09-1200-1300",qty:1}],
 total_amount:"150.00",discount_amount:"0.00",total_pay_amount:"150.00"};
test("real NET 150 NOK from safe paid Quickbutik V1 fields",()=>assert.deepEqual(v(order,c),{ok:true,amountOre:15000,order:"3776"}));
test("98% employee discount preserved when explicit net proof is 3kr",()=>{
 const o={...order,total_pay_amount:"3.00",discount_amount:"147.00"};
 assert.equal(v(o,c).amountOre,300);
});
test("missing paid/discount does not silently use gross",()=>{
 const {total_pay_amount,discount_amount,...unknown}=order;
 assert.equal(v(unknown,c).ok,false);
});
test("refunded order always rejected",()=>assert.equal(v({...order,refunds:[{amount:"1.00"}]},c).ok,false));
test("unpaid order rejected",()=>assert.equal(v({...order,status:0},c).ok,false));
test("wrong booking SKU rejected",()=>assert.equal(v({...order,products:[{...order.products[0],sku:"2026-11-09-1230-1330"}]},c).ok,false));
test("additional products rejected",()=>assert.equal(v({...order,products:[...order.products,{product_id:999}]},c).ok,false));
test("mismatched email or order rejected",()=>{
 assert.equal(v({...order,customer:{email:"other@example.com"}},c).ok,false);
 assert.equal(v({...order,order_id:9999},c).ok,false);
});
test("shipping rejected",()=>assert.equal(v({...order,shipping_amount:"129.00"},c).ok,false));
test("gross-discount arithmetic must match net",()=>assert.equal(v({...order,total_pay_amount:"150.00",discount_amount:"100.00"},c).ok,false));
test("can derive net only when both gross AND discount explicit",()=>{
 const {total_pay_amount,...o}=order;
 assert.equal(v({...o,discount_amount:"30.00"},c).amountOre,12000);
});
test("no confirmed paid booking cannot be reconciled",()=>assert.equal(v(order,{...c,unpriced:false}).ok,false));