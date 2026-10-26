import test from "node:test";
import assert from "node:assert/strict";
import {
  validKeypadCode,createKeypadCode,osloDateTimeToUtc,
  parseBookingSku,extractBookingLines,bookingWindow,
  makeNukiAuthorization,confirmedPaid
} from "./booking-access.mjs";

test("Nuki rejects 0, leading 12 and invalid length",()=>{
  assert.equal(validKeypadCode("123456"),false);
  assert.equal(validKeypadCode("234560"),false);
  assert.equal(validKeypadCode("234567"),true);
  assert.equal(validKeypadCode("23456"),false);
});
test("generator always creates permitted code",()=>{
  let n=0;
  const code=createKeypadCode(()=>++n===1?new Uint32Array([0,1,2,3,4,5]):new Uint32Array([1,2,3,4,5,6]));
  assert.equal(code,"234567");
});
test("Norwegian summer and winter timezone",()=>{
  assert.equal(osloDateTimeToUtc("2026-10-26","10:00"),"2026-10-26T09:00:00.000Z");
  assert.equal(osloDateTimeToUtc("2026-07-05","10:00"),"2026-07-05T08:00:00.000Z");
  assert.throws(()=>osloDateTimeToUtc("2026-03-29","02:30"));
  assert.throws(()=>osloDateTimeToUtc("2026-10-25","02:30"));
});
test("parse booking SKU and 5-min lead time",()=>{
  const slot=parseBookingSku("2026-10-24-1700-2100");
  assert.equal(slot.startUtc,"2026-10-24T15:00:00.000Z");
  assert.equal(slot.endUtc,"2026-10-24T19:00:00.000Z");
  assert.equal(bookingWindow(slot).allowedFromDate,"2026-10-24T14:55:00.000Z");
  assert.throws(()=>parseBookingSku("2026-10-24-2100-1700"));
  assert.throws(()=>parseBookingSku("NOT-A-BOOKING"));
});
test("only configured booking products receive codes",()=>{
  const order={order_id:"3702",products:[
    {id:10,product_id:1349,qty:1,sku:"2026-10-24-1700-2100"},
    {id:11,product_id:1318,qty:1,sku:"DARTPILER"}
  ]};
  const lines=extractBookingLines(order);
  assert.equal(lines.length,1);
  assert.equal(lines[0].bookingKey,"3702:10");
  const auth=makeNukiAuthorization(lines[0],"234567");
  assert.equal(auth.type,13);
  assert.equal(auth.remoteAllowed,false);
  assert.equal(auth.allowedUntilDate,"2026-10-24T19:00:00.000Z");
});
test("pending, canceled and unpaid orders never qualify",()=>{
  assert.equal(confirmedPaid({status:"pending"},true),false);
  assert.equal(confirmedPaid({paymentStatus:"voided"},true),false);
  assert.equal(confirmedPaid({status:"1"},false),false);
  assert.equal(confirmedPaid({status:"1"},true),true);
  assert.equal(confirmedPaid({paymentStatus:"paid"},false),true);
});
