import test from "node:test";
import assert from "node:assert/strict";
import {validExtensionReference as valid,makeExtensionQrPayment as make,safePaymentQrUrl as safe,
  inspectVippsPayment as inspect} from "../supabase/functions/gk2-hyzr-extension-payment/extension-payment-core.mjs";
const ref="GK2EXT-01234567-89ab-4cde-a1b2-1234567890ab";
const cash=v=>({currency:"NOK",value:v});
const auth={reference:ref,state:"AUTHORIZED",amount:cash(7500),aggregate:{
 authorizedAmount:cash(7500),capturedAmount:cash(0),
 refundedAmount:cash(0),cancelledAmount:cash(0)}};
const inspectIt=p=>inspect({reference:ref,amountOre:7500,payment:p});
test("reference only accepts HYZR extension references",()=>{
 assert.equal(valid(ref),true);
 assert.equal(valid("GK2LQR-01234567-89ab-4cde-a1b2-1234567890ab"),false);
});
test("QR charge is exactly server held amount, one of four supported durations",()=>{
 const q=make({reference:ref,amountOre:7500,minutes:30});
 assert.equal(q.amount.value,7500);
 assert.equal(q.userFlow,"QR");
 assert.equal(q.qrFormat.format,"IMAGE/PNG");
 assert.equal(q.qrFormat.size,800);
 assert.equal(q.customerInteraction,"CUSTOMER_PRESENT");
 assert.ok(q.paymentDescription.includes("30 min"));
 assert.throws(()=>make({reference:ref,amountOre:0,minutes:30}));
 assert.throws(()=>make({reference:ref,amountOre:7500,minutes:15}));
});
test("QR must use an official Vipps secure host",()=>{
 assert.ok(safe("https://qr.vipps.no/123"));
 assert.equal(safe("https://qr.vipps.no.evil.example/"),null);
 assert.equal(safe("http://vipps.no"),null);
});
test("created is never a capture approval",()=>{
 const p={...auth,state:"CREATED",aggregate:{}};
 const x=inspectIt(p);
 assert.equal(x.ok,true);assert.equal(x.canCapture,false);
});
test("authorised only is not yet paid",()=>{
 const x=inspectIt(auth);
 assert.equal(x.ok,true);assert.equal(x.canCapture,true);assert.equal(x.fullyCaptured,false);
});
test("captured full amount is confirmed",()=>{
 const p={...auth,aggregate:{...auth.aggregate,capturedAmount:cash(7500)}};
 const x=inspectIt(p);assert.equal(x.fullyCaptured,true);assert.equal(x.canCapture,false);
});
test("partial capture must not extend booking",()=>{
 const p={...auth,aggregate:{...auth.aggregate,capturedAmount:cash(5000)}};
 const x=inspectIt(p);assert.equal(x.fullyCaptured,false);assert.equal(x.canCapture,false);
});
test("refund means not paid for extension",()=>{
 const p={...auth,aggregate:{...auth.aggregate,capturedAmount:cash(7500),refundedAmount:cash(100)}};
 assert.equal(inspectIt(p).fullyCaptured,false);
});
test("wrong amount or currency is rejected",()=>{
 assert.equal(inspectIt({...auth,amount:cash(8000)}).ok,false);
 assert.equal(inspectIt({...auth,aggregate:{...auth.aggregate,authorizedAmount:{currency:"EUR",value:7500}}}).ok,false);
});
test("no amount aggregates after authorization fails closed",()=>{
 assert.equal(inspectIt({...auth,aggregate:{}}).ok,false);
});
test("cancelled authorization never captured",()=>{
 const p={...auth,aggregate:{...auth.aggregate,cancelledAmount:cash(100)}};
 assert.equal(inspectIt(p).canCapture,false);
});
test("mismatched reference rejected",()=>assert.equal(inspectIt({...auth,reference:"GK2EXT-wrong"}).ok,false));
