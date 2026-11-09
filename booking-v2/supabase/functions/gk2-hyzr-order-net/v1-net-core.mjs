// Strict Quickbutik V1 net paid order proof for HYZR extension price.
const money=(v)=>{
 if(typeof v==="number"){const n=Math.round(v*100);return Number.isSafeInteger(n)&&Math.abs(v*100-n)<1e-7&&n>=0?n:null;}
 if(typeof v!=="string"||!/^[0-9]{1,8}(?:\.[0-9]{1,2})?$/.test(v))return null;
 const [a,b=""]=v.split(".");return Number(a)*100+Number(b.padEnd(2,"0"));
};
const email=v=>typeof v==="string"?v.trim().toLowerCase():"";
const hm=n=>String(Math.floor(n/60)).padStart(2,"0")+String(n%60).padStart(2,"0");
export function verifyV1Net(order,candidate){
 const no=(code)=>({ok:false,code});
 if(!order||!candidate||candidate.unpriced!==true)return no("invalid_verified_candidate");
 const id=String(candidate.orderNumber||"");
 if(!/^[1-9][0-9]{0,8}$/.test(id)||String(order.order_id)!==id)return no("wrong_order");
 if(!["1","2"].includes(String(order.status))||order.currency!=="NOK")return no("not_paid_NOK");
 const ec=email(candidate.customerEmail);
 const addresses=[order.customer?.email,order.customer?.email_address,order.customer_email]
   .filter(s=>typeof s==="string"&&s.trim()).map(email);
 if(!ec||addresses.length<1||[...new Set(addresses)].length!==1||addresses[0]!==ec)
   return no("email_not_bound");
 const shipping=money(order.shipping_amount);
 if(shipping!==0)return no("shipping_or_unknown_amount");
 const refunds=order.refunds;
 if(!(refunds===undefined||refunds===null||
     (Array.isArray(refunds)&&refunds.length===0)||
     (!Array.isArray(refunds)&&typeof refunds==="object"&&Object.keys(refunds).length===0)))
   return no("refund_detected");
 const start=Number(candidate.startMin),end=Number(candidate.endMin);
 if(!Number.isInteger(start)||!Number.isInteger(end)||start>=end||
    start<0||end>1440||end-start<30)return no("bad_booking_time");
 const sku=String(candidate.slotDate)+"-"+hm(start)+"-"+hm(end);
 if(!Array.isArray(order.products)||order.products.length!==1)return no("not_one_booking_line");
 const item=order.products[0];
 const productId=Number(item.product_id);
 if(!Number.isSafeInteger(productId)||productId<1474||productId>1506||
    item.sku!==sku||Number(item.qty)!==1)return no("wrong_booking_product_or_sku");
 let paid=null;
 if(order.total_pay_amount!==undefined&&order.total_pay_amount!==null){
   paid=money(order.total_pay_amount);
   // Never accept an explicit paid amount that conflicts with gross/discount arithmetic.
   if(order.total_amount!==undefined&&order.discount_amount!==undefined){
     const gross=money(order.total_amount),discount=money(order.discount_amount);
     if(gross===null||discount===null||gross-discount!==paid)return no("inconsistent_amounts");
   }
 }else if(order.total_amount!==undefined&&order.discount_amount!==undefined){
   const gross=money(order.total_amount),discount=money(order.discount_amount);
   if(gross===null||discount===null||discount>gross)return no("amount_unverifiable");
   paid=gross-discount;
 }
 if(paid===null||!Number.isSafeInteger(paid)||paid<100||paid>100000000)
   return no("no_authoritative_net_paid_amount");
 return {ok:true,amountOre:paid,order:id};
}