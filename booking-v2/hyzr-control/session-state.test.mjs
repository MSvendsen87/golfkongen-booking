import test from "node:test";
import assert from "node:assert/strict";
import {computeHyzrDeviceStatus as calc,instant,safeCheckoutUrl} from "./session-state.mjs";
const booking={id:"a",resource:"hyzr",status:"confirmed",payment_confirmed:true,start_at:"2026-11-08T12:00:00Z",end_at:"2026-11-08T13:00:00Z"};
const next={...booking,id:"b",start_at:"2026-11-08T13:00:00Z",end_at:"2026-11-08T14:00:00Z"};
const offer={available:true,reservation_id:"a",minutes:30,expires_at:"2026-11-08T13:00:00Z",payment_url:"https://golfkongen.no/sider/booking-forlengelse?t=unique"};
const s=(now,reservations=[booking],extensionOffer=null,opts={})=>calc({now,reservations,extensionOffer,...opts});
test("no bookings locked",()=>assert.equal(s("2026-11-08T12:00:00Z",[]).status,"locked"));
test("confirmed paid unlocks",()=>assert.equal(s("2026-11-08T12:15:00Z").screen_phase,"active"));
test("no premature opening",()=>assert.equal(s("2026-11-08T11:59:59Z").status,"locked"));
test("unpaid locked",()=>assert.equal(s("2026-11-08T12:01:00Z",[{...booking,payment_confirmed:false}]).status,"locked"));
test("cancelled locked",()=>assert.equal(s("2026-11-08T12:01:00Z",[{...booking,status:"cancelled"}]).status,"locked"));
test("refunded locked",()=>assert.equal(s("2026-11-08T12:01:00Z",[{...booking,status:"refunded"}]).status,"locked"));
test("held-only locked",()=>assert.equal(s("2026-11-08T12:01:00Z",[{...booking,status:"held"}]).status,"locked"));
test("warning exactly 4 minutes",()=>{
  assert.equal(s("2026-11-08T12:55:59Z").screen_phase,"active");
  assert.equal(s("2026-11-08T12:56:00Z").screen_phase,"warning");
});
test("QR only for valid offer",()=>{
  const a=s("2026-11-08T12:57:00Z",[booking],offer);
  assert.equal(a.extension.available,true);
  assert.equal(a.extension.payment_url,offer.payment_url);
});
test("expired offer suppressed",()=>assert.equal(s("2026-11-08T12:59:00Z",[booking],{...offer,expires_at:"2026-11-08T12:58:00Z"}).extension.available,false));
test("wrong reservation suppressed",()=>assert.equal(s("2026-11-08T12:57:00Z",[booking],{...offer,reservation_id:"other"}).extension.available,false));
test("adjacent booking disallows extension",()=>{
  const a=s("2026-11-08T12:57:00Z",[booking,next],offer);
  assert.equal(a.extension.available,false);
  assert.equal(a.lock_at,"2026-11-08T13:00:00.000Z");
});
test("10 minute grace",()=>{
  assert.equal(s("2026-11-08T13:09:59Z").screen_phase,"grace");
  assert.equal(s("2026-11-08T13:10:00Z").status,"locked");
});
test("new customer gets the next session",()=>assert.equal(s("2026-11-08T13:00:00Z",[booking,next]).reservation_id,"b"));
test("held booking clips grace",()=>{
 const h={...next,id:"h",status:"held",payment_confirmed:false,start_at:"2026-11-08T13:01:00Z"};
 assert.equal(s("2026-11-08T13:00:30Z",[booking,h]).lock_at,"2026-11-08T13:01:00.000Z");
});
test("whole venue includes HYZR",()=>assert.equal(s("2026-11-08T12:01:00Z",[{...booking,resource:"venue"}]).status,"active"));
test("overlap fails closed",()=>assert.equal(s("2026-11-08T12:59:30Z",[booking,{...next,start_at:"2026-11-08T12:59:00Z"}]).status,"locked"));
test("invalid time fails closed",()=>assert.equal(s("2026-11-08T12:01:00Z",[{...booking,end_at:"2026-11-08 13:00"}]).status,"locked"));
test("Oslo offset resolves to UTC",()=>assert.equal(instant("2026-11-08T13:00:00+01:00"),instant("2026-11-08T12:00:00Z")));
test("QR refuses other hosts and http",()=>{
 for(const url of ["http://golfkongen.no","https://example.com/checkout","https://user:pw@golfkongen.no","javascript:alert(1)"])assert.equal(safeCheckoutUrl(url),false);
});
test("maintenance locks",()=>assert.equal(s("2026-11-08T12:01:00Z",[booking],offer,{maintenance:true}).status,"maintenance"));
test("oversized grace locks",()=>assert.equal(s("2026-11-08T12:01:00Z",[booking],offer,{graceMinutes:11}).status,"locked"));
test("longer extension that collides blocked",()=>{
 const b={...next,start_at:"2026-11-08T13:30:00Z",end_at:"2026-11-08T14:30:00Z"};
 assert.equal(s("2026-11-08T12:57:00Z",[booking,b],{...offer,minutes:60}).extension.available,false);
});

test("QR stays valid in ten-minute grace",()=>{
 const extended={...offer,expires_at:"2026-11-08T13:10:00Z"};
 const state=s("2026-11-08T13:09:00Z",[booking],extended);
 assert.equal(state.screen_phase,"grace");
 assert.equal(state.extension.available,true);
});
test("new reservation at end overrides grace immediately",()=>{
 const state=s("2026-11-08T13:00:00Z",[booking,{...next,status:"held",payment_confirmed:false}]);
 assert.equal(state.status,"locked");
});
test("new reservation starting during grace locks on its start",()=>{
 const later={...next,status:"held",payment_confirmed:false,start_at:"2026-11-08T13:05:00Z",end_at:"2026-11-08T13:35:00Z"};
 assert.equal(s("2026-11-08T13:04:59Z",[booking,later]).status,"active");
 assert.equal(s("2026-11-08T13:05:00Z",[booking,later]).status,"locked");
});
test("QR cannot extend if next booking overlaps",()=>{
 const later={...next,status:"confirmed",payment_confirmed:true,start_at:"2026-11-08T13:05:00Z",end_at:"2026-11-08T13:35:00Z"};
 const extended={...offer,expires_at:"2026-11-08T13:10:00Z"};
 assert.equal(s("2026-11-08T13:01:00Z",[booking,later],extended).extension.available,false);
});
