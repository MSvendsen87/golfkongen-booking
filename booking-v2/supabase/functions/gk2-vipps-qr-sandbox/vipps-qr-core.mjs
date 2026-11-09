// Vipps test QR: public-to-admin contract. No booking access or real payment.
export const TEST_MSN="321607",TEST_ORE=100;
const REF=/^GK2TQR-[A-Za-z0-9-]{12,56}$/;
export function isTestReference(reference){return typeof reference==="string"&&REF.test(reference);}
export function createSandboxQrBody(reference){
 if(!isTestReference(reference))throw Error("invalid_test_reference");
 return {
  userFlow:"QR",qrFormat:{format:"IMAGE/SVG+XML"},
  amount:{value:TEST_ORE,currency:"NOK"},
  paymentMethod:{type:"WALLET"},
  customerInteraction:"CUSTOMER_PRESENT",
  reference,
  returnUrl:"https://msvendsen87.github.io/golfkongen-booking/vipps-test.html",
  paymentDescription:"GolfKongen TEST QR – ingen booking"
 };
}
export function safeVippsQrUrl(url){
 if(typeof url!=="string"||url.length>2000)return null;
 try{
  const u=new URL(url);
  if(u.protocol!=="https:"||u.username||u.password)return null;
  const h=u.hostname.toLowerCase();
  if(h==="vipps.no"||h.endsWith(".vipps.no")||
    h==="vippsmobilepay.com"||h.endsWith(".vippsmobilepay.com")){
   return u.href;
  }
 }catch{}
 return null;
}
export function summarizeSandboxPayment(reference,payment){
 if(!isTestReference(reference)||!payment||payment.reference!==reference||
   !["CREATED","AUTHORIZED","ABORTED","EXPIRED","TERMINATED"].includes(payment.state)||
   payment.amount?.currency!=="NOK"||payment.amount?.value!==TEST_ORE)
  return {ok:false,reason:"invalid_test_payment"};
 const agg=payment.aggregate||{};
 const captured=agg.capturedAmount?.value===0&&agg.capturedAmount?.currency==="NOK"?0:agg.capturedAmount?.value;
 return {ok:true,reference,state:payment.state,amountOre:TEST_ORE,
  authorized:payment.state==="AUTHORIZED",
  // "AUTHORIZED" does NOT mean paid/captured. No checkout is ever completed.
  captureStatus:captured===0?"not_captured":"nonzero_or_unknown",
  bookingExtended:false,realMoneyCharged:false};
}
