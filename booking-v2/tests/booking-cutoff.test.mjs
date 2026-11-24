import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const html=readFileSync('docs/booking/index.html','utf8');
const helper=html.slice(html.indexOf('function bookingStartOpen('),html.indexOf('function selectionStillOpen('));
const check=vm.runInNewContext(helper+';bookingStartOpen');
test('Oslo 15:48 allows 16:00 and blocks past starts',()=>{
 const now=Date.parse('2026-11-01T14:48:00Z');
 for(const min of [600,900,930])assert.equal(check('2026-11-01',min,now),false);
 assert.equal(check('2026-11-01',960,now),true);
});
test('simulator and darts close exactly ten minutes before start',()=>{
 for(const resource of ['hyzr','dart_a','dart_b']){
  assert.equal(check('2026-11-01',960,Date.parse('2026-11-01T14:49:59Z'),resource),true);
  assert.equal(check('2026-11-01',960,Date.parse('2026-11-01T14:50:00Z'),resource),false);
 }
});
test('whole-venue bookings keep the 20-minute deadline',()=>{
 assert.equal(check('2026-11-01',960,Date.parse('2026-11-01T14:39:59Z'),'venue'),true);
 assert.equal(check('2026-11-01',960,Date.parse('2026-11-01T14:40:00Z'),'venue'),false);
});
test('midnight and summer time use Oslo regardless of browser timezone',()=>{
 assert.equal(check('2026-11-02',0,Date.parse('2026-11-01T22:50:00Z')),false);
 assert.equal(check('2026-11-02',30,Date.parse('2026-11-01T22:50:00Z')),true);
 assert.equal(check('2027-07-01',960,Date.parse('2027-07-01T13:50:00Z')),false);
 assert.equal(check('2026-10-31',1320,Date.parse('2026-11-01T14:48:00Z')),false);
});
