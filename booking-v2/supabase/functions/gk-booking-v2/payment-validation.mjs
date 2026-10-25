// Booking 2.0: fail-closed verifier for a Quickbutik order fetched SERVER-SIDE after a signed paid webhook.
// PURE logic only: does not accept browser-provided payment status or update any reservation.
// Not connected to /webhook/* while checkout launch gates remain locked.
const validInteger=n=>Number.isSafeInteger(n)&&n>=0;
const asProductId=v=>{
 const n=typeof v==='string'&&v.startsWith('prod_')?Number(v.slice(5)):Number(v);
 return Number.isSafeInteger(n)&&n>0?n:null;
};
const hhmm=min=>String(Math.floor(min/60)).padStart(2,'0')+String(min%60).padStart(2,'0');
export function expectedSlotSku(day,startMin,endMin){
 if(typeof day!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(day)||
  !validInteger(startMin)||!validInteger(endMin)||
  endMin<=startMin||endMin>1440||startMin%30||endMin%30) throw Error('invalid_expected_slot');
 const date=new Date(day+'T12:00:00Z');
 if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==day)throw Error('invalid_slot_day');
 return day+'-'+hhmm(startMin)+'-'+hhmm(endMin);
}
export function validatePaidQuickbutikOrder(order,{reservation,productId,checkoutExpectedPaidOre}={}){
 const reject=(reason)=>({eligible:false,reason,verifiedPaidOre:null,orderId:null});
 if(!order||!reservation||typeof order!=='object')return reject('missing_order_or_reservation');
 if(!['held','payment_pending'].includes(reservation.status))return reject('booking_not_in_payable_state');
 if(typeof reservation.hold_expires_at==='string'&&Date.parse(reservation.hold_expires_at)<=Date.now())
  return reject('hold_expired_manual_review');
 if(order.paymentStatus!=='paid'||!order.paidAt||Number.isNaN(Date.parse(order.paidAt)))
  return reject('order_not_verified_paid');
 if(typeof order.id!=='string'||!/^ord_[A-Za-z0-9_-]{1,80}$/.test(order.id))
  return reject('invalid_order_id');
 if(order.currency!=='NOK')return reject('unexpected_currency');
 if(!Array.isArray(order.lineItems)||order.lineItems.length!==1)return reject('unexpected_order_lines');
 const line=order.lineItems[0];
 if(line?.quantity!==1)return reject('unexpected_quantity');
 if(asProductId(line.productId)!==asProductId(productId))return reject('wrong_product_id');
 let sku;
 try{sku=expectedSlotSku(reservation.slot_date,reservation.start_min,reservation.end_min)}
 catch(_){return reject('invalid_reserved_slot')}
 if(line.sku!==sku)return reject('wrong_slot_sku');
 if(!validInteger(order.amounts?.paid)||!validInteger(checkoutExpectedPaidOre))return reject('missing_effective_checkout_amount');
 if(order.amounts.paid!==checkoutExpectedPaidOre)return reject('discount_or_paid_amount_mismatch');
 if(reservation.customer_email&&typeof order.customer?.email==='string'&&
   reservation.customer_email.trim().toLowerCase()!==order.customer.email.trim().toLowerCase())
   return reject('customer_identity_mismatch');
 const refunds=Array.isArray(order.refunds)?order.refunds:[];
 if(refunds.length>0)return reject('order_refunded_or_partially_refunded');
 // The order subtotal is not necessarily its paid amount: discount/customer-group reductions may apply.
 // Backend must independently fetch authoritative order using Quickbutik credentials.
 // After this verifier succeeds, DB gk2_confirm_paid_slot still checks claims, quote, expiry,
 // nonce uniqueness, payment event replay, and prevents double confirmation.
 return {eligible:true,reason:'paid_order_matches_reserved_slot',verifiedPaidOre:order.amounts.paid,
   orderId:order.id,slotSku:sku,productId:asProductId(productId)};
}
