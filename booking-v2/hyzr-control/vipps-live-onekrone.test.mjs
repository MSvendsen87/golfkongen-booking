import test from "node:test";
import assert from "node:assert/strict";
import {LIVE_MSN,LIVE_ORE,validateLiveConfig,liveOneKroneQr,validVippsQrAddress,
 summarizeLiveOneKrone as status,captureAllowed} from "../supabase/functions/gk2-vipps-live-onekrone/vipps-live-core.mjs";
const ref="GK2LQR-271d0931-a19a-4759-8103-1e56b929224f";
const valid={msn:"859181",clientId:"c833b645-d243-47d5-b5aa-5cd9c1a1c42f",
 clientSecret:"e".repeat(42),subscriptionKey:"a".repeat(32)};
const money=(value)=>({value,currency:"NOK"});
const payment={reference:ref,state:"AUTHORIZED",amount:money(100),
 aggregate:{authorizedAmount:money(100),capturedAmount:money(0),refundedAmount:money(0)}};
test("live MSN is specific and fixed",()=>{
 assert.equal(LIVE_MSN,"859181");assert.equal(LIVE_ORE,100);
 assert.equal(validateLiveConfig(valid).ok,true);
 assert.equal(validateLiveConfig({...valid,msn:"321607"}).ok,false);
 assert.equal(validateLiveConfig({...valid,msn:"859182"}).ok,false);
});
test("live test QR only allows 1 NOK fixed production merchant",()=>{
 const p=liveOneKroneQr(ref);
 assert.equal(p.amount.value,100);assert.equal(p.paymentMethod.type,"WALLET");
 assert.equal(p.userFlow,"QR");assert.equal(p.customerInteraction,"CUSTOMER_PRESENT");
 assert.equal(p.reference,ref);
 assert.equal(p.paymentDescription.includes("1 kr"),true);
});
test("unknown reference cannot request payment",()=>assert.throws(()=>liveOneKroneQr("arbitrary")));
test("only official Vipps HTTPS URLs allowed",()=>{
 assert.ok(validVippsQrAddress("https://qr.vipps.no/a/b"));
 assert.equal(validVippsQrAddress("https://qr.vipps.no.bad.site/a"),null);
 assert.equal(validVippsQrAddress("http://vipps.no/a"),null);
});
test("authorized not the same as captured",()=>{
 const s=status(ref,payment);
 assert.equal(s.authorized,true);assert.equal(s.captured,false);
 assert.equal(s.bookingExtended,false);assert.equal(captureAllowed(s,false),true);
});
test("already captured cannot capture again",()=>{
 const s=status(ref,{...payment,aggregate:{...payment.aggregate,capturedAmount:money(100)}});
 assert.equal(s.captured,true);assert.equal(captureAllowed(s,false),false);
});
test("capture claim blocks duplicated capture",()=>assert.equal(captureAllowed(status(ref,payment),true),false));
test("created, aborted, expired cannot capture",()=>{
 for(const st of ["CREATED","ABORTED","EXPIRED","TERMINATED"])
  assert.equal(captureAllowed(status(ref,{...payment,state:st,aggregate:{
   authorizedAmount:money(0),capturedAmount:money(0),refundedAmount:money(0)}}),false),false);
});
test("wrong currency or amount denies",()=>{
 assert.equal(status(ref,{...payment,amount:{currency:"EUR",value:100}}).ok,false);
 assert.equal(status(ref,{...payment,amount:money(200)}).ok,false);
});
test("refunded amount cannot be called captured",()=>{
 const s=status(ref,{...payment,aggregate:{...payment.aggregate,capturedAmount:money(100),refundedAmount:money(100)}});
 assert.equal(s.captured,false);assert.equal(captureAllowed(s,false),false);
});
test("wrong owner payment reference denied",()=>assert.equal(status(ref,{...payment,reference:"bad"}).ok,false));
test("malformed captured amount denies",()=>{
 const a={...payment.aggregate,capturedAmount:{currency:"USD",value:100}};
 assert.equal(status(ref,{...payment,aggregate:a}).ok,false);
});
test("missing production keys means no live calls",()=>{
 assert.equal(validateLiveConfig({...valid,clientSecret:""}).ok,false);
});
