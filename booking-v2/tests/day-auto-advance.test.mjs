import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync('docs/booking/index.html','utf8');
const clock=html.slice(html.indexOf('function bookingStartOpen('),html.indexOf('function selectionStillOpen('));
const advance=html.slice(html.indexOf('function advanceFinishedDay('),html.indexOf('function render(a){'));
function scenario(minutes,now,date='2026-11-04',resource='hyzr'){
 const nodes={'gk-v2-day':{value:date,max:'2026-12-19'},'gk-v2-duration':{value:String(minutes)},'gk-v2-resource':{value:resource},'gk-v2-terms':{hidden:false},'gk-v2-accept':{checked:true},'gk-v2-submit':{disabled:false}};
 let draws=0;
 const context={$:id=>nodes[id],draw:()=>draws++,plusCalendarDays:(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)};
 const check=vm.runInNewContext(clock+advance+';advanceFinishedDay',context);
 const changed=check({day:date,bookingEnabled:true,openingHoursByResource:{[resource]:{from:600,to:1320}}},Date.parse(now));
 return {changed,nodes,draws};
}
test('one-hour booking advances at 20:40 Oslo, not one second earlier',()=>{
 assert.equal(scenario(60,'2026-11-04T19:39:59Z').changed,false);
 const r=scenario(60,'2026-11-04T19:40:00Z');
 assert.equal(r.changed,true);assert.equal(r.nodes['gk-v2-day'].value,'2026-11-05');assert.equal(r.draws,1);
 assert.equal(r.nodes['gk-v2-terms'].hidden,true);assert.equal(r.nodes['gk-v2-submit'].disabled,true);
});
test('30-minute bookings stay on today until 21:10 Oslo; venue closes at 17:40',()=>{
 assert.equal(scenario(30,'2026-11-04T20:09:59Z').changed,false);
 assert.equal(scenario(30,'2026-11-04T20:10:00Z').changed,true);
 assert.equal(scenario(240,'2026-11-04T16:40:00Z','2026-11-04','venue').changed,true);
});
test('late-night page shows tomorrow and preserves deliberately selected future dates',()=>{
 assert.equal(scenario(60,'2026-11-04T22:36:00Z').changed,true);
 assert.equal(scenario(60,'2026-11-04T22:36:00Z','2026-11-06').changed,false);
});
