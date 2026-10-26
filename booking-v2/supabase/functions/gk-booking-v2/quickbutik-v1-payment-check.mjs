// Booking 2.0: pure verification of the CURRENT Quickbutik V1 order read.
// V1 statuses per published API: -1 cancelled, 0 unpaid, 1 paid, 2 fulfilled.
// Never invoke this with a browser-provided order/quote/reservation.
// No network, database writes, Pushover or launch flag changes here.
import {expectedSlotSku} from './payment-validation.mjs';

const validOre=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
const productId=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null};
const qty=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=1?n:null};
const email=s=>typeof s==='string'?s.trim().toLowerCase():'';
const id=s=>/^[1-9][0-9]{0,8}$/.test(String(s||''))?String(s):null;

// Quickbutik V1 monetary fields use strings in NOK, not integer minor units.
export function v1NokToOre(value){
 if(typeof value!=='string'||!/^\d{1,9}(?:\.\d{1,2})?$/.test(value))return null;
 const [whole,frac='']=value.split('.');
 const ore=Number(whole)*100+Number(frac.padEnd(2,'0'));
 return validOre(ore)?ore:null;
}
export function checkV1BookingPayment(order, options={}){
 const reject=reason=>({eligible:false,reason});
 const {reservation,expectedProductId,expectedPaidOre,expectedRentalSets=0,nowMs=Date.now()}=options;
 if(!order||typeof order!=='object'||!reservation)return reject('missing_authoritative_data');
 if(!['held','payment_pending','confirmed'].includes(reservation.status))return reject('reservation_not_payable');
 if(!id(reservation.quickbutik_order_id)||id(order.order_id)!==id(reservation.quickbutik_order_id))
  return reject('order_not_bound_to_reservation');
 if(!['1','2'].includes(String(order.status)))return reject('order_not_currently_paid');
 if(order.currency!=='NOK')return reject('wrong_currency');
 const expires=Date.parse(reservation.hold_expires_at);
 if(typeof reservation.hold_expires_at!=='string'||!Number.isFinite(expires)||!Number.isFinite(nowMs))
  return reject('hold_expiry_missing');
 if(reservation.status!=='confirmed'&&expires<=nowMs)return reject('hold_expired_manual_review');
 if(typeof reservation.terms_version!=='string'||!/^gk-v[0-9][a-z0-9.-]{0,48}$/.test(reservation.terms_version))
  return reject('terms_version_missing');
 const reservedEmail=email(reservation.customer_email);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservedEmail))return reject('customer_not_bound');
 if(reservedEmail!==email(order.customer?.email))return reject('customer_mismatch');
 if(!validOre(expectedPaidOre))return reject('missing_server_authorized_total');
 // For some Quickbutik V1 orders total_pay_amount is absent. V1 also
 // exposes total_amount and (sometimes) discount_amount. Never mistake gross
 // order amount for the actual charge, especially with 98% discounts.
 const hasExplicitPaid=order.total_pay_amount!==undefined&&order.total_pay_amount!==null;
 let paid;
 if(hasExplicitPaid){
  paid=v1NokToOre(order.total_pay_amount);
  if(paid===null)return reject('authoritative_total_missing_or_invalid');
  // Check arithmetic coherence when BOTH gross and discount are supplied.
  if(order.total_amount!==undefined&&order.discount_amount!==undefined){
   const gross=v1NokToOre(order.total_amount),discount=v1NokToOre(order.discount_amount);
   if(gross===null||discount===null||gross-discount!==paid)
    return reject('payment_amount_fields_conflict');
  }
 }else{
  const gross=v1NokToOre(order.total_amount);
  const discount=v1NokToOre(order.discount_amount);
  // Without explicit gross+discount fields, the paid amount cannot be proved.
  if(gross===null||discount===null)return reject('paid_amount_unverifiable');
  if(discount>gross)return reject('invalid_discount_exceeds_total');
  paid=gross-discount;
 }
 if(paid!==expectedPaidOre)return reject('paid_total_mismatch');
 const shipping=v1NokToOre(order.shipping_amount);
 if(shipping===null||shipping!==0)return reject('unexpected_booking_shipping');
 // V1 refunds may be null, [], or empty object; anything else needs review.
 const refunds=order.refunds;
 if(refunds!==null&&refunds!==undefined&&
    !(Array.isArray(refunds)&&refunds.length===0)&&
    !(typeof refunds==='object'&&!Array.isArray(refunds)&&Object.keys(refunds).length===0))
  return reject('refunded_or_unknown_refund_state');
 if(!Number.isSafeInteger(expectedRentalSets)||expectedRentalSets<0||expectedRentalSets>6)
  return reject('invalid_rental_set_count');
 if(reservation.resource==='hyzr'&&expectedRentalSets>0)return reject('hyzr_does_not_allow_rental');
 let sku;
 try{sku=expectedSlotSku(reservation.slot_date,reservation.start_min,reservation.end_min)}
 catch{return reject('invalid_reservation_slot')}
 if(!Array.isArray(order.products)||order.products.length!==1+(expectedRentalSets>0?1:0))
  return reject('unexpected_order_lines');
 const bookingLines=order.products.filter(x=>productId(x?.product_id)===productId(expectedProductId));
 if(bookingLines.length!==1)return reject('booking_product_missing_or_duplicate');
 const booking=bookingLines[0];
 if(String(booking.sku||'')!==sku||qty(booking.qty)!==1)return reject('wrong_variant_sku_or_quantity');
 const extras=order.products.filter(x=>x!==booking);
 if(expectedRentalSets&&
    (extras.length!==1||productId(extras[0]?.product_id)!==1318||qty(extras[0]?.qty)!==expectedRentalSets))
  return reject('rental_sets_mismatch');
 return {eligible:true,reason:'payment_matches_bound_hold',orderId:id(order.order_id),paidOre:paid,slotSku:sku,rentalSets:expectedRentalSets};
}
