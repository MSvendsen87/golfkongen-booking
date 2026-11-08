import test from "node:test";
import assert from "node:assert/strict";
import {adaptVerifiedDeviceResponse as map} from "./device-state-adapter.mjs";
const status={ok:true,state:"warning",bookingId:"booking123",resource:"hyzr",
 startsAt:"2026-11-08T12:00:00.000Z",endsAt:"2026-11-08T13:00:00.000Z",
 lockAt:"2026-11-08T13:10:00.000Z",checkedAt:"2026-11-08T12:56:00Z"};
test("untrusted caller always remains locked",()=>assert.equal(map(status,false).status,"locked"));
test("trusted paid preview normalizes field names",()=>{
 const x=map(status,true);
 assert.equal(x.reservation_id,status.bookingId);
 assert.equal(x.end_at,status.endsAt);
 assert.equal(x.screen_phase,"warning");
 assert.equal(x.payment_confirmed,true);
});
test("staff mode normalizes",()=>{
 const x=map({...status,state:"staff"},true);
 assert.equal(x.staff_mode,true);
 assert.equal(x.screen_phase,"staff");
});
test("grace mode normalizes",()=>assert.equal(map({...status,state:"grace"},true).screen_phase,"grace"));
test("no session cannot open machine",()=>assert.equal(map({ok:true,state:"locked"},true).status,"locked"));
test("malformed end time fails closed",()=>assert.equal(map({...status,endsAt:"tomorrow"},true).status,"locked"));
test("no booking id fails closed",()=>assert.equal(map({...status,bookingId:""},true).status,"locked"));
test("QR not enabled just because preview says extensionPossible",()=>{
 const x=map({...status,extensionPossible:true,payment_url:"https://evil.example"},true);
 assert.equal(x.extension.available,false);
});

test("admin preview without server timestamp cannot be used as live device state",()=>assert.equal(
 map({...status,checkedAt:undefined},true).status,"locked"));
test("unsupported resource does not unlock HYZR",()=>assert.equal(
 map({...status,resource:"dart_a"},true).status,"locked"));
