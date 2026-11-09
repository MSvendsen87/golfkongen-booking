import test from "node:test";
import assert from "node:assert/strict";
import {evaluateDeviceLease as lease,deriveSessionHandover as handover} from "./device-lease.mjs";
const state={status:"active",payment_confirmed:true,reservation_id:"paid1",screen_phase:"active",
 end_at:"2026-11-08T13:00:00Z",checked_at:"2026-11-08T12:50:00Z",lock_at:"2026-11-08T13:00:00Z"};
const evalAt=(now,snapshot=state,opts={})=>lease({snapshot,receivedAtMonotonicMs:5000,nowMonotonicMs:now,...opts});
test("fresh verified booking permits device access",()=>assert.equal(evalAt(5000).access,"active"));
test("10m booking end still obeys six-second snapshot expiry",()=>{
 assert.equal(evalAt(10999).access,"active");
 assert.equal(evalAt(11000).reason,"connection_stale");
});
test("server deadline can cut off snapshot immediately",()=>{
 const near={...state,checked_at:"2026-11-08T12:59:59Z",lock_at:"2026-11-08T13:00:00Z"};
 assert.equal(evalAt(5999,near).access,"active");
 assert.equal(evalAt(6000,near).reason,"session_deadline_reached");
});
test("unpaid and locked do not unlock",()=>{
 assert.equal(evalAt(5000,{...state,payment_confirmed:false}).access,"locked");
 assert.equal(evalAt(5000,{...state,status:"locked"}).access,"locked");
});
test("missing time fails locked",()=>assert.equal(evalAt(5000,{...state,checked_at:undefined}).reason,"invalid_server_deadline"));
test("past deadline fails locked",()=>assert.equal(evalAt(5000,{...state,lock_at:state.checked_at}).access,"locked"));
test("system clock reset cannot extend the lease",()=>assert.equal(evalAt(4999).access,"locked"));
test("malformed monotonic timestamp fails locked",()=>assert.equal(evalAt(Infinity).reason,"invalid_device_clock"));
test("unsafe excessive stale allowance rejected",()=>assert.equal(evalAt(5001,state,{maxSnapshotAgeMs:3600000}).reason,"invalid_freshness_policy"));
test("staff bypass also needs heartbeat",()=>{
 const staff={...state,screen_phase:"staff",lock_at:"2026-11-08T21:00:00Z"};
 assert.equal(evalAt(11000,staff).access,"locked");
});
test("new paid customer requires HYZR game reset",()=>{
 const next={...state,reservation_id:"paid2"};
 assert.deepEqual(handover(state,next),{
  kind:"new_customer",forceReturnToHyzrStart:true,showWelcomeAfterReset:true
 });
});
test("same booking paid extension does not reset HYZR game",()=>{
 const next={...state,end_at:"2026-11-08T13:30:00Z"};
 assert.equal(handover(state,next).kind,"extension_confirmed");
 assert.equal(handover(state,next).forceReturnToHyzrStart,false);
});
test("staff code activation doesn't reset ongoing game",()=>assert.equal(
 handover(state,{...state,screen_phase:"staff"}).kind,"staff_mode_enabled"));
test("staff code revocation is detected",()=>assert.equal(
 handover({...state,screen_phase:"staff"},state).kind,"staff_mode_ended"));
test("unpaid next customer never triggers an unlock",()=>assert.equal(
 handover(state,{...state,reservation_id:"paid2",payment_confirmed:false}).kind,"session_locked"));
test("new verified booking after lock can welcome new customer",()=>assert.equal(
 handover({status:"locked"},state).showWelcomeAfterReset,true));
