import test from "node:test";
import assert from "node:assert/strict";
import {normalizeServerStatus as map,verifyHashFormat,validDeviceTokenFormat,compareHexConstantTime} from "./device-status-core.mjs";
const now="2026-11-08T12:30:00.000Z";
const live={ok:true,state:"active",bookingId:"secure-id",resource:"hyzr",
 startsAt:"2026-11-08T12:00:00.000Z",endsAt:"2026-11-08T13:00:00.000Z",lockAt:"2026-11-08T13:10:00.000Z"};
test("backend active booking produces safe limited status",()=>{
 const x=map(live,now);
 assert.equal(x.status,"active");
 assert.equal(x.payment_confirmed,true);
 assert.equal(x.checked_at,now);
 assert.equal(x.extension.available,false);
 assert.equal("customer_email" in x,false);
});
test("no paid booking stays locked",()=>assert.equal(map({ok:true,state:"locked"},now).status,"locked"));
test("future checked timestamp must be valid",()=>assert.equal(map(live,"wrong").status,"locked"));
test("no booking id stays locked",()=>assert.equal(map({...live,bookingId:""},now).status,"locked"));
test("wrong resource stays locked",()=>assert.equal(map({...live,resource:"dart_a"},now).status,"locked"));
test("expired deadline stays locked",()=>assert.equal(map({...live,lockAt:"2026-11-08T12:29:59Z"},now).status,"locked"));
test("warning is valid only final 4min",()=>{
 assert.equal(map({...live,state:"warning"},now).status,"locked");
 assert.equal(map({...live,state:"warning"},"2026-11-08T12:59:00Z").screen_phase,"warning");
});
test("grace valid only after original end",()=>{
 assert.equal(map({...live,state:"grace"},now).status,"locked");
 assert.equal(map({...live,state:"grace"},"2026-11-08T13:05:00Z").screen_phase,"grace");
});
test("staff mode only from booking start",()=>{
 assert.equal(map({...live,state:"staff"},"2026-11-08T11:59:59Z").status,"locked");
 assert.equal(map({...live,state:"staff"},now).screen_phase,"staff");
});
test("token and hash format strict",()=>{
 assert.equal(validDeviceTokenFormat("A".repeat(43)),true);
 assert.equal(validDeviceTokenFormat("demo"),false);
 assert.equal(validDeviceTokenFormat("A".repeat(44)+"?"),false);
 assert.equal(verifyHashFormat("a".repeat(64)),true);
 assert.equal(verifyHashFormat("A".repeat(64)),false);
});
test("hash comparison handles equal and differing values",()=>{
 assert.equal(compareHexConstantTime("a".repeat(64),"a".repeat(64)),true);
 assert.equal(compareHexConstantTime("a".repeat(64),"b".repeat(64)),false);
 assert.equal(compareHexConstantTime("hello","hello"),false);
});
test("cancellation and missing states fail closed",()=>{
 assert.equal(map({ok:false},now).status,"locked");
 assert.equal(map(null,now).status,"locked");
});
