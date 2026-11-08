/**
 * Strict Vipps ePayment settlement checks for HYZR extensions.
 * A webhook, browser callback, screenshot, or payment CREATED/AUTHORIZED state
 * is NEVER evidence of money captured. Trust only a server-to-Vipps GET
 * after an idempotent capture request has succeeded.
 *
 * This module cannot extend a booking – a DB transaction must validate/commit
 * the existing hold against Booking 2.0 resource availability.
 */
const REF=/^[A-Za-z0-9-]{8,64}$/;
function ore(value) {
  return Number.isSafeInteger(value)&&value>=100&&value<=100000000;
}
function nokAmount(obj) {
  return obj&&obj.currency==="NOK"&&Number.isSafeInteger(obj.value)&&obj.value>=0
     ?obj.value:null;
}
export function buildVippsCapture({reference,amountOre,idempotencyKey}={}) {
  if(typeof reference!=="string"||!REF.test(reference))throw Error("invalid_reference");
  if(!ore(amountOre))throw Error("invalid_amount");
  if(typeof idempotencyKey!=="string"||!REF.test(idempotencyKey))throw Error("invalid_idempotency_key");
  return {
    method:"POST",
    path:"/epayment/v1/payments/"+encodeURIComponent(reference)+"/capture",
    headers:{"Idempotency-Key":idempotencyKey},
    body:{modificationAmount:{currency:"NOK",value:amountOre}}
  };
}
export function capturedVippsPayment({reference,amountOre,payment}={}) {
  if(typeof reference!=="string"||!REF.test(reference)||!ore(amountOre))return {ok:false,reason:"invalid_attempt"};
  if(!payment||payment.reference!==reference||payment.state!=="AUTHORIZED")
    return {ok:false,reason:"not_matching_authorized_payment"};
  const agg=payment.aggregate||{};
  const authorized=nokAmount(agg.authorizedAmount);
  const captured=nokAmount(agg.capturedAmount);
  const refunded=nokAmount(agg.refundedAmount);
  if(authorized===null||captured===null||refunded===null)
    return {ok:false,reason:"incomplete_payment_aggregate"};
  // One unique Vipps reference per booking extension; no partial payment.
  if(authorized!==amountOre||captured!==amountOre||refunded!==0)
    return {ok:false,reason:"not_fully_captured"};
  return {ok:true,reference,amountOre};
}
/** Pure authorization guard. Atomic DB transaction is mandatory afterward. */
export function extensionCommitEligible({hold,paymentProof,nowMs}={}) {
  if(!hold||!Number.isFinite(nowMs)||hold.status!=="payment_pending"||
     hold.capacityLocked!==true||hold.originalBookingVerified!==true||
     typeof hold.reservationId!=="string"||!hold.reservationId||
     !Number.isFinite(hold.expiresAtMs)||nowMs>=hold.expiresAtMs)
    return {ok:false,reason:"hold_invalid_or_expired"};
  if(!Number.isInteger(hold.priceOre)||hold.priceOre<0)
    return {ok:false,reason:"invalid_price"};
  if(hold.priceOre===0) {
    // Clips must be verified and debited atomically; zero price never means free.
    return hold.punchcardDebitCommitted===true && hold.punchcardMinutes===hold.extraMinutes
      ?{ok:true,method:"punchcard"}:{ok:false,reason:"punchcard_not_debited"};
  }
  if(hold.priceOre<100)return {ok:false,reason:"below_vipps_minimum"};
  const result=capturedVippsPayment({
    reference:hold.vippsReference,amountOre:hold.priceOre,payment:paymentProof
  });
  if(!result.ok)return result;
  return {ok:true,method:"vipps"};
}
