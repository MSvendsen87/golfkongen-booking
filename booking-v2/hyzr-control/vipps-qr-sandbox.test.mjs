import test from "node:test";
import assert from "node:assert/strict";
import {createSandboxQrBody,TEST_MSN,TEST_ORE,isTestReference,safeVippsQrUrl,summarizeSandboxPayment} from "../supabase/functions/gk2-vipps-qr-sandbox/vipps-qr-core.mjs";
const ref="GK2TQR-00000000-1111-2222-3333-444444444444";
test("fixed TEST merchant and amount are required",()=>{
 assert.equal(TEST_MSN,"321607");assert.equal(TEST_ORE,100);
 const p=createSandboxQrBody(ref);
 assert.equal(p.userFlow,"QR");assert.equal(p.customerInteraction,"CUSTOMER_PRESENT");
 assert.equal(p.amount.value,100);assert.equal(p.paymentMethod.type,"WALLET");
});
test("cannot inject user price/reference",()=>{
 assert.throws(()=>createSandboxQrBody("../create"));
 assert.equal(isTestReference("live-1234"),false);
});
test("redirect URL allows Vipps-owned HTTPS only",()=>{
 assert.ok(safeVippsQrUrl("https://qr.vipps.no/test/qr.png?a=1"));
 assert.ok(safeVippsQrUrl("https://landing.vipps.no?token=redacted"));
 assert.equal(safeVippsQrUrl("http://qr.vipps.no/test"),null);
 assert.equal(safeVippsQrUrl("https://qr.vipps.no.evil.example/"),null);
 assert.equal(safeVippsQrUrl("javascript:alert(1)"),null);
});
test("new payment is not captured",()=>{
 const p=summarizeSandboxPayment(ref,{
  reference:ref,state:"CREATED",amount:{currency:"NOK",value:100},
  aggregate:{capturedAmount:{currency:"NOK",value:0}}});
 assert.equal(p.ok,true);assert.equal(p.authorized,false);assert.equal(p.bookingExtended,false);
});
test("AUTHORIZED cannot turn into paid booking",()=>{
 const p=summarizeSandboxPayment(ref,{
  reference:ref,state:"AUTHORIZED",amount:{currency:"NOK",value:100},
  aggregate:{capturedAmount:{currency:"NOK",value:0}}});
 assert.equal(p.authorized,true);assert.equal(p.captureStatus,"not_captured");
 assert.equal(p.bookingExtended,false);
});
test("wrong test payment amount rejected",()=>assert.equal(summarizeSandboxPayment(ref,{
 reference:ref,state:"AUTHORIZED",amount:{currency:"NOK",value:6000}}).ok,false));
test("wrong reference rejected",()=>assert.equal(summarizeSandboxPayment(ref,{
 reference:"GK2TQR-wrong-123456",state:"CREATED",amount:{currency:"NOK",value:100}}).ok,false));
test("capture ambiguity is reported, never treated as eligible booking",()=>{
 const p=summarizeSandboxPayment(ref,{
 reference:ref,state:"AUTHORIZED",amount:{currency:"NOK",value:100},
 aggregate:{capturedAmount:{currency:"NOK",value:100}}});
 assert.equal(p.bookingExtended,false);assert.equal(p.captureStatus,"nonzero_or_unknown");
});
