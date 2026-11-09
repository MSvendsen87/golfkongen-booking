import test from "node:test";
import assert from "node:assert/strict";
import {validStaffAttempt as attempt,validCurrentStaffBooking as booking} from "../supabase/functions/gk2-hyzr-staff-device/staff-guard.mjs";
test("eight-digit per-employee code allowed",()=>assert.equal(attempt({code:"12345678"}),true));
test("cannot use arbitrary PIN, browser booking ID or short code",()=>{
 assert.equal(Boolean(attempt({code:"1234"})),false);
 assert.equal(Boolean(attempt({code:"abcd1234"})),false);
 assert.equal(Boolean(attempt({reservation:"x"})),false);
});
test("staff activation requires currently paid HYZR resource",()=>{
 assert.equal(booking({ok:true,state:"active",resource:"hyzr",bookingId:"873b85c0-1b06-4f51-a32f-1cecded84fbf"}),true);
 assert.equal(booking({ok:true,state:"locked",resource:"hyzr",bookingId:"873b85c0-1b06-4f51-a32f-1cecded84fbf"}),false);
 assert.equal(booking({ok:true,state:"warning",resource:"dart_a",bookingId:"873b85c0-1b06-4f51-a32f-1cecded84fbf"}),false);
});