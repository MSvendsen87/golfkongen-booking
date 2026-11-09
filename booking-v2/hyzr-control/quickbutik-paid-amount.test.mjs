import test from "node:test";
import assert from "node:assert/strict";
import {verifiedQuickbutikAmount as verify} from "./quickbutik-paid-amount.mjs";
const order={id:"ord_3774",orderNumber:3774,paymentStatus:"paid",currency:"NOK",
 customer:{email:"test@example.com"},refunds:[],amounts:{total:30000,subtotal:30000,shipping:0,discount:0,paid:30000},
 lineItems:[{productId:"prod_1479",sku:"2026-11-11-1430-1630",quantity:1}]};
const booking={quickbutik_order_id:"3774",customer_email:"test@example.com",resource:"hyzr",status:"confirmed",
 verified_paid_at:"2026-11-08T17:39:00Z",slot_date:"2026-11-11",start_min:870,end_min:990,paid_ore:null};
test("verifies actual net 300kr for authorized HYZR booking",()=>{
 const x=verify(order,booking); assert.deepEqual(x,{verified:true,amountOre:30000,orderId:"3774",resource:"hyzr"});
});
test("reconciles discount instead of gross",()=>{
 const discounted={...order,amounts:{total:300,paid:300,subtotal:30000,shipping:0,discount:29700}};
 assert.equal(verify(discounted,booking).amountOre,300);
});
test("never infer net amount from only gross",()=>assert.equal(verify({...order,amounts:{...order.amounts,paid:null}},booking).verified,false));
test("customer email must match",()=>assert.equal(verify({...order,customer:{email:"other@example.com"}},booking).verified,false));
test("id and receipt must match",()=>assert.equal(verify({...order,id:"ord_9999"},booking).verified,false));
test("a payment only authorized is not paid",()=>assert.equal(verify({...order,paymentStatus:"authorized"},booking).verified,false));
test("refunded orders are rejected",()=>assert.equal(verify({...order,refunds:[{amount:100}]},booking).verified,false));
test("non-NOK payment not accepted",()=>assert.equal(verify({...order,currency:"EUR"},booking).verified,false));
test("shipping or extra products requires manual amount reconciliation",()=>{
 assert.equal(verify({...order,amounts:{...order.amounts,shipping:100}},booking).verified,false);
 assert.equal(verify({...order,lineItems:[...order.lineItems,{productId:"prod_20"}]},booking).verified,false);
});
test("wrong SKU not accepted",()=>assert.equal(verify({...order,lineItems:[{...order.lineItems[0],sku:"2026-11-12-1430-1630"}]},booking).verified,false));
test("clashing previously recorded amount rejected",()=>assert.equal(verify(order,{...booking,paid_ore:20000}).verified,false));
test("existing matching amount is idempotent",()=>assert.equal(verify(order,{...booking,paid_ore:30000}).verified,true));
test("unverified booking never produces proof",()=>assert.equal(verify(order,{...booking,verified_paid_at:null}).verified,false));
