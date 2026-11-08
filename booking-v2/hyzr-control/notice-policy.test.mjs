import test from "node:test";
import assert from "node:assert/strict";
import {deriveHyzrScreen as screen,acknowledgeHyzrNotice as ack} from "./notice-policy.mjs";
const s=(screen_phase,reservation_id="A",status="active")=>({screen_phase,reservation_id,status});
test("warning appears at four minutes",()=>assert.equal(screen(s("warning")).notice,"four_minute_warning"));
test("dismiss warning keeps access open",()=>{
 const state=s("warning"),d=ack(state);
 assert.equal(screen(state,d).notice,null);
 assert.equal(screen(state,d).access,"active");
});
test("new expired notice appears even after warning dismissal",()=>{
 const d=ack(s("warning"));
 assert.equal(screen(s("grace"),d).notice,"booking_expired");
});
test("expired notice can be dismissed",()=>{
 const d=ack(s("grace"));
 assert.equal(screen(s("grace"),d).notice,null);
 assert.equal(screen(s("grace"),d).access,"active");
});
test("ten-minute grace contains no countdown",()=>assert.equal(screen(s("grace")).showGraceCountdown,false));
test("staff mode shows no warning",()=>assert.equal(screen(s("staff")).notice,null));
test("new customer gets their own warning",()=>{
 const d=ack(s("warning","A"));
 assert.equal(screen(s("warning","B"),d).notice,"four_minute_warning");
});
test("server lock cannot be dismissed",()=>{
 const d=ack(s("grace"));
 const result=screen(s("grace","A","locked"),d);
 assert.equal(result.access,"locked");
 assert.equal(result.dismissible,false);
 assert.equal(result.notice,null);
});
