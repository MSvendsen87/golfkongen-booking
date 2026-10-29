import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyClubPaidOrder} from '../supabase/functions/gk-booking-v2/club-paid-order.mjs';
const club={product_id:'1507',qty:'1',sku:'GK2-CLUB-2026-11-05-0123456789abcdef0123456789abcdef'};
const order={order_id:'3736',status:'1',currency:'NOK',total_amount:'50.00',total_pay_amount:'50.00',discount_amount:null,shipping_amount:'0.00',refunds:[],customer:{email:'test@example.com'},products:[club]};
test('V1 null discount accepted only with explicit matching paid and gross amount',()=>{
 assert.equal(verifyClubPaidOrder(order,'3736').ok,true);
 for(const changes of [{total_pay_amount:'49.00'},{total_pay_amount:null},{total_amount:'51.00'},{shipping_amount:'1.00'},{refunds:[{amount:1}]},{status:'0'},{products:[club,{product_id:42,qty:1}]}])assert.equal(verifyClubPaidOrder({...order,...changes},'3736').ok,false,JSON.stringify(changes));
});
test('one rental charged at 75 NOK, and mismatched paid order number rejected',()=>{
 assert.equal(verifyClubPaidOrder({...order,total_amount:'75.00',total_pay_amount:'75.00',products:[club,{product_id:'1318',qty:'1'}]},'3736').ok,true);
 assert.equal(verifyClubPaidOrder(order,'3737').ok,false);
});
