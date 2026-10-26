import assert from 'node:assert/strict';
import test from 'node:test';
import {validatePaidQuickbutikOrder} from './payment-validation.mjs';

const reservation={status:'held',slot_date:'2026-11-01',start_min:600,end_min:660,
  hold_expires_at:'2099-11-01T00:00:00Z',customer_email:'staff@example.invalid'};
const slot={productId:'prod_1477',sku:'2026-11-01-1000-1100',quantity:1,variantId:282442};
const rental={productId:'prod_1318',sku:'1318',quantity:2};
const mkOrder=(lines=[slot],paid=1050)=>({id:'ord_3706',paymentStatus:'paid',
 paidAt:'2026-10-26T00:45:50Z',fulfillmentStatus:'unfulfilled',currency:'NOK',
 lineItems:lines,customer:{email:'staff@example.invalid'},amounts:{paid},refunds:[]});
const valid=(o=mkOrder(),extra={})=>validatePaidQuickbutikOrder(o,{
  reservation,productId:1477,checkoutExpectedPaidOre:o.amounts.paid,...extra});
test('accepts verified staff price with signed checkout discount',()=>{
 const r=valid();assert.equal(r.eligible,true);assert.equal(r.verifiedPaidOre,1050);
});
test('accepts optional 2 rented dart sets in same paid order',()=>{
 const r=valid(mkOrder([rental,slot],6500),{expectedRentalSets:2});
 assert.equal(r.eligible,true);assert.equal(r.rentalSets,2);
});
test('no rental selected rejects additional lines',()=>{
 assert.equal(valid(mkOrder([slot,rental],6500)).reason,'unexpected_addon');
});
test('rental count must match exactly',()=>{
 assert.equal(valid(mkOrder([slot,rental],6500),{expectedRentalSets:1}).reason,'rental_set_mismatch');
});
test('product substitution cannot pass as rental',()=>{
 assert.equal(valid(mkOrder([slot,{...rental,productId:'prod_9999'}],6500),{expectedRentalSets:2}).reason,'rental_set_mismatch');
});
test('booking and rental cannot both be duplicated',()=>{
 assert.equal(valid(mkOrder([slot,slot])).reason,'missing_or_duplicate_booking_product');
});
test('booking product must match mapped duration product',()=>{
 assert.equal(valid(mkOrder([{...slot,productId:'prod_1486'}])).reason,'missing_or_duplicate_booking_product');
});
test('wrong time variant SKU fails',()=>{
 assert.equal(valid(mkOrder([{...slot,sku:'2026-11-01-1100-1200'}])).reason,'wrong_slot_sku');
});
test('unexpected third cart line fails',()=>{
 assert.equal(valid(mkOrder([slot,rental,rental])).reason,'unexpected_order_lines');
});
test('checkout expected amount cannot be guessed from gross price',()=>{
 assert.equal(valid(mkOrder(),{checkoutExpectedPaidOre:1500}).reason,'discount_or_paid_amount_mismatch');
});
test('wrong customer email fails closed',()=>{
 assert.equal(valid({...mkOrder(),customer:{email:'other@example.invalid'}}).reason,'customer_identity_mismatch');
});
test('missing customer email fails closed',()=>{
 assert.equal(valid({...mkOrder(),customer:null}).reason,'customer_identity_mismatch');
});
test('cancelled order fails even if paidAt exists',()=>{
 assert.equal(valid({...mkOrder(),fulfillmentStatus:'cancelled'}).reason,'order_cancelled');
});
test('refunded paid order fails',()=>{
 assert.equal(valid({...mkOrder(),refunds:[{amount:500}]}).reason,'order_refunded_or_partially_refunded');
});
test('an expired hold cannot be confirmed even if paid',()=>{
 assert.equal(valid(mkOrder(),{reservation:{...reservation,hold_expires_at:'2025-01-01T00:00:00Z'}}).reason,'hold_expired_manual_review');
});
test('unverified order cannot be confirmed',()=>{
 assert.equal(valid({...mkOrder(),paymentStatus:'pending'}).reason,'order_not_verified_paid');
});
