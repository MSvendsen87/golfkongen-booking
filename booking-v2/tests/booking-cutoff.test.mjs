import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const html=readFileSync('docs/booking/index.html','utf8');
const helper=html.slice(html.indexOf('function bookingStartOpen('),html.indexOf('function selectionStillOpen('));
const check=vm.runInNewContext(helper+';bookingStartOpen');
test('Oslo 15:48 blocks past starts and 16:00, allows 16:30',()=>{
 const now=Date.parse('2026-11-01T14:48:00Z');
 for(const min of [600,900,930,960])assert.equal(check('2026-11-01',min,now),false);
 assert.equal(check('2026-11-01',990,now),true);
});
test('closes exactly 20 minutes before start including seconds',()=>{
 assert.equal(check('2026-11-01',960,Date.parse('2026-11-01T14:39:59Z')),true);
 assert.equal(check('2026-11-01',960,Date.parse('2026-11-01T14:40:00Z')),false);
});
test('midnight and summer time use Oslo regardless of browser timezone',()=>{
 assert.equal(check('2026-11-02',0,Date.parse('2026-11-01T22:50:00Z')),false);
 assert.equal(check('2026-11-02',30,Date.parse('2026-11-01T22:50:00Z')),true);
 assert.equal(check('2027-07-01',960,Date.parse('2027-07-01T13:40:00Z')),false);
 assert.equal(check('2026-10-31',1320,Date.parse('2026-11-01T14:48:00Z')),false);
});
