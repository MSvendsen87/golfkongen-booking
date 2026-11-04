import {v1NokToOre,verifiedV1CustomerEmail} from './quickbutik-v1-payment-check.mjs';
// Only authoritative paid order readback can grant prepaid time.
export function punchcardOrder(order, orderId) {
 const lines=Array.isArray(order?.products)?order.products:[];
 const cards=lines.filter(line=>[1160,1161].includes(Number(line.product_id)));
 if(!cards.length)return null;
 if(cards.length!==1||lines.length!==1||(!Number.isInteger(Number(cards[0].qty))||Number(cards[0].qty)<1||Number(cards[0].qty)>1000)||order.currency!=="NOK"||String(order.order_id)!==String(orderId))throw Error("invalid_punchcard_order");
 const pack=Number(cards[0].product_id)===1161?{minutes:1200,ore:200000}:{minutes:600,ore:120000};
 const email=verifiedV1CustomerEmail(order);
 if(!email)throw Error("invalid_punchcard_identity");
 if(String(order.status)==="-1")return {email,cancelled:true,quantity:Number(cards[0].qty),unitMinutes:pack.minutes};
 const refunds=order.refunds;
 if(refunds!==null&&refunds!==undefined&&!(Array.isArray(refunds)&&refunds.length===0)&&
    !(typeof refunds==='object'&&!Array.isArray(refunds)&&Object.keys(refunds).length===0))throw Error('punchcard_refund_review');
 let paid=v1NokToOre(order.total_pay_amount);
 if(order.total_pay_amount==null){
  const gross=v1NokToOre(order.total_amount),discount=v1NokToOre(order.discount_amount);
  if(gross!==null&&discount!==null&&discount<=gross)paid=gross-discount;
 }
 if(!["1","2"].includes(String(order.status))||paid!==pack.ore*Number(cards[0].qty)||v1NokToOre(order.shipping_amount)!==0)throw Error("punchcard_payment_not_verified");
 return {email,cancelled:false,quantity:Number(cards[0].qty),unitMinutes:pack.minutes};
}
