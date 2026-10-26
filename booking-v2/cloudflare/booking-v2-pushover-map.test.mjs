import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingV2Notice,bookingV2Products} from './booking-v2-pushover-map.mjs';
const booking={productId:1477,sku:'2026-11-01-1000-1100',customer:'Test',
 orderId:'3706',quantity:1,bookingId:'book_12345678',
 outboxKind:'booking_confirmed',bookingStatus:'confirmed',verifiedPaid:true};
test('all 33 products are represented',()=>assert.equal(bookingV2Products.size,33));
test('genuine verified confirmed reservation produces one format event',()=>{
 const r=bookingV2Notice(booking);
 assert.equal(r.type,'booking');assert.equal(r.eventKey,'book_12345678:booking_confirmed:v1');
});
test('standalone real checkout test never sends booking push',()=>{
 assert.equal(bookingV2Notice({...booking,sku:'GK2-TEST-ONLY-20261026-1H'}),null);
});
test('no notification from raw paid webhook without confirmed booking',()=>{
 assert.equal(bookingV2Notice({...booking,bookingId:undefined}),null);
 assert.equal(bookingV2Notice({...booking,bookingStatus:'held'}),null);
 assert.equal(bookingV2Notice({...booking,outboxKind:undefined}),null);
 assert.equal(bookingV2Notice({...booking,verifiedPaid:false}),null);
});
test('extra dart sets included only when verified',()=>{
 assert.match(bookingV2Notice({...booking,productId:1486,rentalSets:2}).message,/Pilsett: 2 stk/);
});
test('incorrect duration must be manually reviewed, not reported as confirmed',()=>{
 const r=bookingV2Notice({...booking,productId:1478});assert.equal(r.type,'manual_review');
});
test('wrong day or invalid times require manual review',()=>{
 assert.equal(bookingV2Notice({...booking,sku:'2026-02-30-1000-1100'}).type,'manual_review');
 assert.equal(bookingV2Notice({...booking,sku:'2026-11-01-2500-2600'}).type,'manual_review');
});
test('unknown product and rental-only product produce no push',()=>{
 assert.equal(bookingV2Notice({...booking,productId:1318}),null);
 assert.equal(bookingV2Notice({...booking,productId:9999}),null);
});
test('duplicate payment delivery yields same event key for dedupe',()=>{
 const a=bookingV2Notice(booking),b=bookingV2Notice(booking);
 assert.equal(a.eventKey,b.eventKey);
});
