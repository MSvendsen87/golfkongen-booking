import test from "node:test";
import assert from "node:assert/strict";
import {buildVippsCapture,capturedVippsPayment as verify,extensionCommitEligible as eligible} from "./vipps-settlement.mjs";
const reference="GK2-EXT-AAAABBBB",amountOre=5900;
const data={reference,state:"AUTHORIZED",aggregate:{
 authorizedAmount:{currency:"NOK",value:amountOre},
 capturedAmount:{currency:"NOK",value:amountOre},
 refundedAmount:{currency:"NOK",value:0}}};
const hold={status:"payment_pending",capacityLocked:true,originalBookingVerified:true,
 reservationId:"reserv1",expiresAtMs:10000,priceOre:amountOre,extraMinutes:30,
 vippsReference:reference};
test("capture request uses exact Vipps endpoint and minor units",()=>{
 const x=buildVippsCapture({reference,amountOre,idempotencyKey:"GK2-EXT-CAP-0001"});
 assert.equal(x.path,"/epayment/v1/payments/"+reference+"/capture");
 assert.equal(x.body.modificationAmount.value,amountOre);
 assert.equal(x.headers["Idempotency-Key"],"GK2-EXT-CAP-0001");
});
test("cannot capture less than NOK 1",()=>assert.throws(()=>buildVippsCapture({reference,amountOre:99,idempotencyKey:"GK2-EXT-CAP-0001"})));
test("cannot capture with missing idempotency key",()=>assert.throws(()=>buildVippsCapture({reference,amountOre,idempotencyKey:"bad"})));
test("payment authorized only, without capture, is not paid",()=>{
 assert.equal(verify({reference,amountOre,payment:{...data,aggregate:{...data.aggregate,capturedAmount:{currency:"NOK",value:0}}}}).ok,false);
});
test("fully captured GET payment verifies",()=>assert.equal(verify({reference,amountOre,payment:data}).ok,true));
test("wrong payment reference rejected",()=>assert.equal(verify({reference,amountOre,payment:{...data,reference:"OTHER-REF-9999"}}).ok,false));
test("partially captured money rejected",()=>assert.equal(verify({reference,amountOre,payment:{...data,aggregate:{...data.aggregate,capturedAmount:{currency:"NOK",value:amountOre-100}}}}).ok,false));
test("refunded money rejected",()=>assert.equal(verify({reference,amountOre,payment:{...data,aggregate:{...data.aggregate,refundedAmount:{currency:"NOK",value:100}}}}).ok,false));
test("wrong currency rejected",()=>assert.equal(verify({reference,amountOre,payment:{...data,aggregate:{...data.aggregate,capturedAmount:{currency:"EUR",value:amountOre}}}}).ok,false));
test("payment with wrong authorized amount rejected",()=>assert.equal(verify({reference,amountOre,payment:{...data,aggregate:{...data.aggregate,authorizedAmount:{currency:"NOK",value:amountOre+100}}}}).ok,false));
test("expired capacity hold blocks extension even if paid",()=>assert.equal(eligible({hold,paymentProof:data,nowMs:10000}).ok,false));
test("missing lock blocks extension even if paid",()=>assert.equal(eligible({hold:{...hold,capacityLocked:false},paymentProof:data,nowMs:9999}).ok,false));
test("valid hold and captured payment may proceed to atomic DB commit",()=>assert.equal(eligible({hold,paymentProof:data,nowMs:9999}).ok,true));
test("punchcard requires atomic debit",()=>assert.equal(eligible({hold:{...hold,priceOre:0,punchcardDebitCommitted:false,punchcardMinutes:30},nowMs:9999}).ok,false));
test("punchcard debited exact minutes permits DB commit",()=>assert.equal(eligible({hold:{...hold,priceOre:0,punchcardDebitCommitted:true,punchcardMinutes:30},nowMs:9999}).method,"punchcard"));
test("free non-clip booking cannot be falsely treated as punchcard",()=>assert.equal(eligible({hold:{...hold,priceOre:0,punchcardDebitCommitted:false},nowMs:9999}).ok,false));
