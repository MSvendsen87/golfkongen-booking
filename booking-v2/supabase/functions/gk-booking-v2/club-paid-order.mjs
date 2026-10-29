import {clubOrderLines} from "./club-engine.mjs";
import {v1NokToOre,verifiedV1CustomerEmail} from "./quickbutik-v1-payment-check.mjs";
export function verifyClubPaidOrder(order,orderNumber){
 const reject=code=>({ok:false,code});
 if(!order||String(order.order_id)!==String(orderNumber)||order.currency!=="NOK")return reject("invalid_club_order");
 if(!["1","2"].includes(String(order.status)))return reject("club_payment_not_verified");
 let input;try{input=clubOrderLines(order)}catch(_){return reject("invalid_club_order_lines")}
 if(v1NokToOre(order.shipping_amount)!==0)return reject("club_shipping_requires_review");
 if(order.refunds!=null&&!(Array.isArray(order.refunds)&&order.refunds.length===0)&&
 !(typeof order.refunds==="object"&&!Array.isArray(order.refunds)&&Object.keys(order.refunds).length===0))return reject("club_refund_requires_review");
 const gross=v1NokToOre(order.total_amount),discount=v1NokToOre(order.discount_amount);
 let paid=null;
 if(order.total_pay_amount!=null){
  paid=v1NokToOre(order.total_pay_amount);
  if(paid===null)return reject("club_paid_amount_invalid");
  if(order.total_amount!=null){
   // V1 represents no discount as null. Accept only when explicit paid equals gross.
   if(gross===null||(order.discount_amount==null?gross!==paid:(discount===null||discount>gross||gross-discount!==paid)))return reject("club_payment_amount_fields_conflict");
  }
 }else{
  if(gross===null||discount===null||discount>gross)return reject("club_explicit_paid_amount_missing");
  paid=gross-discount;
 }
 if(paid!==input.expectedOre)return reject("club_total_paid_mismatch");
 const email=verifiedV1CustomerEmail(order);if(!email)return reject("club_customer_missing");
 return {ok:true,...input,paidOre:paid,email};
}

