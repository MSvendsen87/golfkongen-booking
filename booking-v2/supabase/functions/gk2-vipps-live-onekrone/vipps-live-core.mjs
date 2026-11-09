// Strict one-krone production Vipps QR trial. Never a HYZR booking/payment endpoint.
export const LIVE_MSN="859181";
export const LIVE_ORE=100;
const RE=/^GK2LQR-[A-Za-z0-9-]{12,56}$/;
export function validLiveReference(reference){return typeof reference==="string"&&RE.test(reference);}
export function validateLiveConfig(c){
 if(!c||c.msn!==LIVE_MSN)return {ok:false,code:"live_msn_missing_or_wrong"};
 if(!/^[a-fA-F0-9-]{36}$/.test(c.clientId||"")||
    typeof c.clientSecret!=="string"||c.clientSecret.length<20||
    !/^[a-fA-F0-9]{32}$/.test(c.subscriptionKey||""))
    return {ok:false,code:"live_credentials_missing"};
 return {ok:true};
}
export function liveOneKroneQr(reference) {
 if(!validLiveReference(reference))throw Error("invalid_reference");
 return {
  reference,
  amount:{currency:"NOK",value:LIVE_ORE},
  paymentMethod:{type:"WALLET"},
  userFlow:"QR",customerInteraction:"CUSTOMER_PRESENT",
  qrFormat:{format:"IMAGE/SVG+XML"},
  paymentDescription:"GolfKongen – 1 kr integrasjonstest",
  returnUrl:"https://golfkongen.no/"
 };
}
export function validVippsQrAddress(url){
 if(typeof url!=="string"||url.length>2000)return null;
 try{
  const u=new URL(url);
  const host=u.hostname.toLowerCase();
  if(u.protocol!=="https:"||u.username||u.password)return null;
  if(host==="vipps.no"||host.endsWith(".vipps.no")||
     host==="vippsmobilepay.com"||host.endsWith(".vippsmobilepay.com"))
    return u.href;
 }catch{}
 return null;
}
function n(a){return a&&a.currency==="NOK"&&Number.isSafeInteger(a.value)?a.value:null;}
export function summarizeLiveOneKrone(reference,payment){
 const deny=code=>({ok:false,code});
 if(!validLiveReference(reference)||!payment||payment.reference!==reference)
  return deny("reference_mismatch");
 if(!["CREATED","AUTHORIZED","ABORTED","EXPIRED","TERMINATED"].includes(payment.state)||
    n(payment.amount)!==LIVE_ORE)return deny("unexpected_payment");
 const a=payment.aggregate||{};
 const captured=n(a.capturedAmount);
 const authorized=n(a.authorizedAmount);
 const refunded=n(a.refundedAmount);
 if(captured===null||authorized===null||refunded===null)return deny("missing_payment_totals");
 if(captured<0||authorized<0||refunded<0||captured>LIVE_ORE||
    refunded>captured||authorized>LIVE_ORE)return deny("invalid_payment_totals");
 const fullyCaptured=payment.state==="AUTHORIZED"&&authorized===LIVE_ORE&&
    captured===LIVE_ORE&&refunded===0;
 return {
  ok:true,reference,state:payment.state,amountOre:LIVE_ORE,
  authorized:payment.state==="AUTHORIZED"&&authorized===LIVE_ORE,
  captured:fullyCaptured,
  label:fullyCaptured?"1 kr mottatt":"Ingen bekreftet betaling",
  bookingExtended:false
 };
}
export function captureAllowed(paymentSummary,captureStarted){
 return paymentSummary?.ok===true&&paymentSummary.authorized===true&&
  paymentSummary.captured===false&&captureStarted===false;
}
