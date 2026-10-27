import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHmac} from 'node:crypto';
import {checkedBooking,nukiPayload,matchingNukiAuth,accessMail,bookedNotice,
 encryptAccessCode,decryptAccessCode,LOCK_ID} from './notify-core.mjs';
import {signDispatchRequest,verifyDispatchRequest} from './dispatch-auth.mjs';
const b={bookingId:'121a5541-989b-46d0-8c44-ea0cf10b3baa',
 orderId:'3702',email:'customer@example.invalid',day:'2026-11-02',
 resource:'dart_a',startMin:600,endMin:660,rentalSets:2,productId:1486};
const key='this-is-only-test-key-0000111122223333';
test('Nuki code is correctly limited to booked Oslo time plus 15 minutes',()=>{
 const booking=checkedBooking(b);
 assert.equal(booking.startUtc,'2026-11-02T09:00:00.000Z');
 assert.equal(booking.endUtc,'2026-11-02T10:00:00.000Z');
 const auth=nukiPayload(booking,'345678');
 assert.equal(auth.type,13);
 assert.deepEqual(auth.smartlockIds,[LOCK_ID]);
 assert.equal(auth.allowedFromDate,'2026-11-02T08:45:00.000Z');
 assert.equal(auth.allowedUntilDate,booking.endUtc);
 assert.equal(auth.remoteAllowed,false);
});
test('Nuki app authorization only accepted after matching code, lock and exact dates',()=>{
 const booking=checkedBooking(b),payload=nukiPayload(booking,'345678');
 const valid={type:13,smartlockId:LOCK_ID,code:345678,name:booking.name,
  allowedFromDate:payload.allowedFromDate,allowedUntilDate:payload.allowedUntilDate,id:99};
 assert.equal(matchingNukiAuth([valid],booking,'345678').id,99);
 assert.equal(matchingNukiAuth([{...valid,code:999999}],booking,'345678'),undefined);
 assert.equal(matchingNukiAuth([{...valid,smartlockId:100}],booking,'345678'),undefined);
 assert.equal(matchingNukiAuth([{...valid,allowedUntilDate:'2026-11-03T10:00:00Z'}],booking,'345678'),undefined);
});
test('sender receives correct local time and PIN in separate confirmation email',()=>{
 const booking=checkedBooking(b);
 const msg=accessMail(booking,'345678');
 assert.match(msg.text,/10:00–11:00/);
 assert.match(msg.text,/345678/);
 assert.match(msg.text,/10 minutter før bookingstart/);
 assert.doesNotMatch(msg.text,/15 minutter før bookingstart/);
 assert.deepEqual(msg.to,['customer@example.invalid']);
 assert.match(bookedNotice(booking).message,/Pilsett: 2/);
 assert.throws(()=>accessMail(booking,'123456'),/invalid_code/);
});
test('rejects invalid booking claims including non-existent Oslo DST wall clock',()=>{
 assert.throws(()=>checkedBooking({...b,resource:'unknown'}));
 assert.throws(()=>checkedBooking({...b,day:'2026-03-29',startMin:120,endMin:180}),/Ambiguous or nonexistent Oslo time/);
 assert.throws(()=>checkedBooking({...b,endMin:600}),/invalid_verified_booking_outbox/);
});
test('AES-GCM ciphertext persists PIN and rejects different keys',async()=>{
 const secret=btoa(String.fromCharCode(...new Uint8Array(32).fill(22)));
 const wrong=btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
 const enc=await encryptAccessCode('345678',secret);
 assert.notEqual(enc,'345678');
 assert.equal(await decryptAccessCode(enc,secret),'345678');
 await assert.rejects(decryptAccessCode(enc,wrong));
});
test('signed dispatch timestamp cannot be replayed outside its time window',async()=>{
 const stamp='1793060000',ts=Number(stamp)*1000;
 const signature=await signDispatchRequest(key,stamp);
 assert.equal(await verifyDispatchRequest({apiKey:key,timestamp:stamp,signature,nowMs:ts}),true);
 assert.equal(await verifyDispatchRequest({apiKey:key,timestamp:stamp,signature,nowMs:ts+121000}),false);
 const derived=createHmac('sha256',key).update('gk2-booking-confirmed-notifications-key-v1').digest();
 const expected=createHmac('sha256',derived).update('POST:/internal/dispatch:'+stamp).digest('hex');
 assert.equal(signature,expected);
});
