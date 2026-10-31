import test from 'node:test';
import assert from 'node:assert/strict';
import {v1NokToOre,checkV1BookingPayment} from './quickbutik-v1-payment-check.mjs';

const until='2099-01-01T00:00:00Z';
const reservation={status:'held',quickbutik_order_id:'3777',slot_date:'2026-11-01',
 resource:'dart_a',start_min:600,end_min:660,hold_expires_at:until,
 customer_email:'person@example.invalid',terms_version:'gk-v1'};
const base={order_id:'3777',status:'1',currency:'NOK',total_pay_amount:'120.00',
 shipping_amount:'0.00',customer:{email:'PERSON@example.invalid'},refunds:[],
 products:[{product_id:'1486',sku:'2026-11-01-1000-1100',qty:'1'}]};
const verify=(order=base,opts={})=>checkV1BookingPayment(order,{
 reservation,expectedProductId:1486,expectedPaidOre:12000,...opts});

test('exact V1 NOK conversion (no float rounding)',()=>{
 assert.equal(v1NokToOre('10.50'),1050);
 assert.equal(v1NokToOre('10.5'),1050);
 assert.equal(v1NokToOre('0'),0);
 assert.equal(v1NokToOre(12.34),1234); // V1 may emit an exact numeric NOK amount.
 for(const s of ['1e6','12.345','-1','12,3',12.345,'NaN']) assert.equal(v1NokToOre(s),null);
});
test('accepts matching paid order with bound active hold',()=>{
 const result=verify();assert.equal(result.eligible,true);assert.equal(result.paidOre,12000);
});
test('accepts status 2 already fulfilled after payment',()=>{
 assert.equal(verify({...base,status:'2'}).eligible,true);
});
test('rejects cancelled, unpaid and unknown statuses',()=>{
 for(const status of ['-1','0','paid',null,'3'])assert.equal(verify({...base,status}).reason,'order_not_currently_paid');
});
test('rejects order mismatch and missing prior checkout order binding',()=>{
 assert.equal(verify({...base,order_id:'3778'}).reason,'order_not_bound_to_reservation');
 assert.equal(verify(base,{reservation:{...reservation,quickbutik_order_id:null}}).reason,'order_not_bound_to_reservation');
});
test('rejects expired and missing hold',()=>{
 assert.equal(verify(base,{reservation:{...reservation,hold_expires_at:'2020-01-01T00:00:00Z'}}).reason,'hold_expired_manual_review');
 assert.equal(verify(base,{reservation:{...reservation,hold_expires_at:null}}).reason,'hold_expiry_missing');
});
test('rejects missing and wrong identity',()=>{
 assert.equal(verify({...base,customer:{email:'other@example.invalid'}}).reason,'customer_mismatch');
 assert.equal(verify(base,{reservation:{...reservation,customer_email:null}}).reason,'customer_not_bound');
});
test('rejects prices changed by coupons without server-authorized paid total',()=>{
 const discounted={...base,total_pay_amount:'10.50'};
 assert.equal(verify(discounted).reason,'paid_total_mismatch');
 assert.equal(verify(discounted,{expectedPaidOre:1050}).eligible,true);
 assert.equal(verify(base,{expectedPaidOre:null}).reason,'missing_server_authorized_total');
});
test('rejects 45 NOK shipping charge even if total matched',()=>{
 assert.equal(verify({...base,shipping_amount:'45.00'}).reason,'unexpected_booking_shipping');
});
test('rejects wrong slot, booking product or duplicate lines',()=>{
 assert.equal(verify({...base,products:[{...base.products[0],sku:'2026-11-01-1100-1200'}]}).reason,'wrong_variant_sku_or_quantity');
 assert.equal(verify({...base,products:[{...base.products[0],product_id:1477}]}).reason,'booking_product_missing_or_duplicate');
 assert.equal(verify({...base,products:[base.products[0],base.products[0]]}).reason,'unexpected_order_lines');
});
test('rejects refunds even when status looks paid',()=>{
 assert.equal(verify({...base,refunds:[{id:1}]}).reason,'refunded_or_unknown_refund_state');
 assert.equal(verify({...base,refunds:{id:1}}).reason,'refunded_or_unknown_refund_state');
});
test('allows 2 optional dart sets only when expected and in the same order',()=>{
 const withSets={...base,total_pay_amount:'170.00',
 products:[...base.products,{product_id:'1318',sku:'1318',qty:'2'}]};
 assert.equal(verify(withSets,{expectedRentalSets:2,expectedPaidOre:17000}).eligible,true);
 assert.equal(verify(withSets,{expectedRentalSets:1,expectedPaidOre:17000}).reason,'rental_sets_mismatch');
 assert.equal(verify(withSets,{expectedPaidOre:17000}).reason,'unexpected_order_lines');
});
test('HYZR cannot sneak in dart sets',()=>{
 const hyzrRes={...reservation,resource:'hyzr'};
 assert.equal(verify(base,{reservation:hyzrRes,expectedRentalSets:2}).reason,'hyzr_does_not_allow_rental');
});
test('requires a server-recorded terms version',()=>{
 assert.equal(verify(base,{reservation:{...reservation,terms_version:null}}).reason,'terms_version_missing');
});

test('verified confirmed booking supports idempotent late webhook replay',()=>{
 const alreadyConfirmed={...reservation,status:'confirmed',hold_expires_at:'2020-01-01T00:00:00Z'};
 assert.equal(verify(base,{reservation:alreadyConfirmed}).eligible,true);
 assert.equal(verify({...base,status:'-1'},{reservation:alreadyConfirmed}).reason,'order_not_currently_paid');
});


test('Quickbutik V1 documented gross and explicit zero discount verify final charge',()=>{
 const order={...base,total_amount:'120.00',discount_amount:'0.00'};
 delete order.total_pay_amount;
 assert.equal(verify(order).eligible,true);
 assert.equal(verify(order).paidOre,12000);
});
test('real-world large discount is subtracted from documented V1 gross',()=>{
 const order={...base,total_amount:'800.00',discount_amount:'784.00'};
 delete order.total_pay_amount;
 assert.equal(verify(order,{expectedPaidOre:1600}).eligible,true);
 assert.equal(verify(order,{expectedPaidOre:80000}).reason,'paid_total_mismatch');
});
test('gross 800 NOK is never treated as paid 800 NOK without proven zero discount',()=>{
 const order={...base,total_amount:'800.00'};
 delete order.total_pay_amount;
 assert.equal(verify(order,{expectedPaidOre:1600}).reason,'paid_amount_unverifiable');
 assert.equal(verify(order,{expectedPaidOre:80000}).reason,'paid_amount_unverifiable');
 delete order.total_amount;
 assert.equal(verify(order).reason,'paid_amount_unverifiable');
});
test('conflicting explicit charge and gross-minus-discount are rejected',()=>{
 const checked={...base,total_amount:'800.00',discount_amount:'784.00',total_pay_amount:'16.00'};
 assert.equal(verify(checked,{expectedPaidOre:1600}).eligible,true);
 assert.equal(verify({...checked,discount_amount:'0.00'},{expectedPaidOre:1600}).reason,'payment_amount_fields_conflict');
});
test('invalid price strings and over-discounting never authorize',()=>{
 const raw={...base,total_amount:'1e6',discount_amount:'0.00'};delete raw.total_pay_amount;
 assert.equal(verify(raw).reason,'paid_amount_unverifiable');
 assert.equal(verify({...raw,total_amount:'120.00',discount_amount:'121.00'}).reason,'invalid_discount_exceeds_total');
 assert.equal(verify({...raw,status:'0'}).reason,'order_not_currently_paid');
 assert.equal(verify({...raw,status:'-1'}).reason,'order_not_currently_paid');
});

test('status-only policy verifies a genuine V1 paid order with no net amount fields',()=>{
 const order={...base,total_amount:'800.00'};
 delete order.total_pay_amount;
 const v=verify(order,{paymentPolicy:'trusted_status'});
 assert.equal(v.eligible,true);
 assert.equal(v.amountVerified,false);
 assert.equal(v.paidOre,null);
});
test('status-only still rejects unpaid, cancelled, wrong product, wrong slot and customer',()=>{
 const order={...base,total_amount:'800.00'};
 delete order.total_pay_amount;
 const opts={paymentPolicy:'trusted_status'};
 for(const status of ['0','-1','3']){
  assert.equal(verify({...order,status},opts).reason,'order_not_currently_paid');
 }
 assert.equal(verify({...order,order_id:'9999'},opts).reason,'order_not_bound_to_reservation');
 assert.equal(verify({...order,customer:{email:'attacker@invalid.example'}},opts).reason,'customer_mismatch');
 assert.equal(verify({...order,products:[{...base.products[0],sku:'2026-11-01-1100-1200'}]},opts).reason,'wrong_variant_sku_or_quantity');
 assert.equal(verify({...order,products:[{...base.products[0],product_id:'1477'}]},opts).reason,'booking_product_missing_or_duplicate');
});
test('status-only denies unexpected shipping, refunds, extra goods and duplicate booking lines',()=>{
 const order={...base};delete order.total_pay_amount;
 const opts={paymentPolicy:'trusted_status'};
 assert.equal(verify({...order,shipping_amount:'59.00'},opts).reason,'unexpected_booking_shipping');
 assert.equal(verify({...order,refunds:[{id:'x'}]},opts).reason,'refunded_or_unknown_refund_state');
 assert.equal(verify({...order,products:[...order.products,...order.products]},opts).reason,'unexpected_order_lines');
});
test('unknown amount policy never confirms a booking',()=>{
 assert.equal(verify(base,{paymentPolicy:'whatever'}).reason,'invalid_payment_policy');
});
