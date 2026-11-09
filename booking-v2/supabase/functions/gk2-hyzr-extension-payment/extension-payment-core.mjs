/**
 * HYZR extension ePayment protocol: no network, no DB, no side effects.
 * Payment and time are always derived server side. Never extend on CREATED,
 * AUTHORIZED alone, QR scan, webhook payload or HTTP 200 capture response.
 */
const REF=/^GK2EXT-[a-f0-9-]{36}$/;
const allowedMinutes=new Set([30,60,90,120]);
function nok(v){
 return v&&v.currency==="NOK"&&Number.isSafeInteger(v.value)&&v.value>=0?v.value:null;
}
export function validExtensionReference(ref){
 return typeof ref==="string"&&REF.test(ref);
}
export function safePaymentQrUrl(v){
 if(typeof v!=="string"||v.length>2048)return null;
 try {
  const u=new URL(v);
  if(u.protocol!=="https:"||u.username||u.password)return null;
  const h=u.hostname.toLowerCase();
  if(h==="vipps.no"||h.endsWith(".vipps.no")||
     h==="vippsmobilepay.com"||h.endsWith(".vippsmobilepay.com"))return u.href;
 }catch{}
 return null;
}
export function makeExtensionQrPayment({reference,amountOre,minutes}={}){
 if(!validExtensionReference(reference)||!allowedMinutes.has(minutes)||
    !Number.isSafeInteger(amountOre)||amountOre<100||amountOre>100000000)
   throw Error("invalid_extension_payment");
 return {
   reference,
   amount:{currency:"NOK",value:amountOre},
   userFlow:"QR",qrFormat:{format:"IMAGE/SVG+XML"},
   customerInteraction:"CUSTOMER_PRESENT",
   paymentMethod:{type:"WALLET"},
   paymentDescription:"GolfKongen HYZR – forlengelse "+minutes+" min",
   returnUrl:"https://golfkongen.no/"
 };
}
export function inspectVippsPayment({reference,amountOre,payment}={}){
 const bad=reason=>({ok:false,reason});
 if(!validExtensionReference(reference)||!Number.isSafeInteger(amountOre)||
   amountOre<100||amountOre>100000000||!payment||
   payment.reference!==reference)return bad("reference_or_amount_mismatch");
 if(!["CREATED","AUTHORIZED","ABORTED","EXPIRED","TERMINATED"].includes(payment.state))
   return bad("unexpected_state");
 if(nok(payment.amount)!==amountOre)return bad("payment_total_mismatch");
 if(payment.state!=="AUTHORIZED")
   return {ok:true,state:payment.state,authorized:false,fullyCaptured:false,canCapture:false};
 const agg=payment.aggregate||{};
 const authorized=nok(agg.authorizedAmount);
 const captured=nok(agg.capturedAmount);
 const refunded=nok(agg.refundedAmount);
 const cancelled=agg.cancelledAmount===undefined?0:nok(agg.cancelledAmount);
 if(authorized===null||captured===null||refunded===null||cancelled===null||
   authorized!==amountOre||captured>amountOre||refunded>captured||
   cancelled>amountOre || cancelled<0)
   return bad("inconsistent_aggregate");
 return {
   ok:true,state:"AUTHORIZED",authorized:true,
   fullyCaptured:captured===amountOre&&refunded===0&&cancelled===0,
   canCapture:captured===0&&refunded===0&&cancelled===0,
   authorizedOre:authorized,capturedOre:captured
 };
}
