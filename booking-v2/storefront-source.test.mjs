import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../docs/booking/index.html',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('./data/quickbutik-duration-manifest.json',import.meta.url),'utf8'));
const policies=JSON.parse(readFileSync(new URL('./data/public-prices.json',import.meta.url),'utf8'));
test('all 33 durations use the same public price policies in source and storefront',()=>{
 assert.equal(policies.length,33);
 const embedded=JSON.parse(html.match(/^var PUBLIC_PRICES=(.*);$/m)[1]);
 assert.deepEqual(embedded,policies);
 for(const p of manifest.products){
  const rows=policies.filter(x=>x.resource===p.resource&&x.minutes===p.minutes&&x.productId===p.productId);
  assert.equal(rows.length,1);assert.ok(Number.isFinite(rows[0].price)&&rows[0].price>0);
 }
});
test('late availability response cannot replace the newly chosen date',async()=>{
 let resolver;
 const nodes={'gk-v2-continue':{},'gk-v2-status':{},'gk-v2-times':{},'gk-v2-day':{value:'2026-11-02',min:'2026-11-01',max:'2026-12-11'}};
 const c={availabilityRequest:0,snapshot:null,selected:null,updateSummary:()=>{},renderDays:()=>{},CONF:{apiUrl:'https://example.invalid'},$:id=>nodes[id],fetch:()=>new Promise(r=>{resolver=r}),render:()=>{throw Error('stale render')},encodeURIComponent,Error};
 const source=html.slice(html.indexOf('function draw(){'),html.indexOf('function priceFor('));
 runInNewContext(source+';draw()',c);
 nodes['gk-v2-day'].value='2026-11-03';
 resolver({ok:true,json:async()=>({ok:true,day:'2026-11-02'})});
 await new Promise(r=>setImmediate(r));
 assert.equal(nodes['gk-v2-status'].textContent,'Henter tilgjengelige tider …');
});

test('time grid rejects ranges crossing a claim or venue block',()=>{
 const source=html.slice(html.indexOf('function intervalOpen('),html.indexOf('function render(a){'));
 const open=runInNewContext(source+';intervalOpen',{bookingStartOpen:()=>true});
 const hours={from:600,to:1320};
 const day={openingHoursByResource:{hyzr:hours,dart_a:hours,dart_b:hours,venue:hours},blocks:[]};
 const occupied=new Set(['dart_a|660']);
 assert.equal(open(day,'dart_a',600,60,occupied),true);
 assert.equal(open(day,'dart_a',600,90,occupied),false);
 assert.equal(open(day,'dart_b',600,90,occupied),true);
 assert.equal(open(day,'venue',600,240,occupied),false);
 day.blocks=[{target:'venue_only',start_min:660,end_min:690}];
 assert.equal(open(day,'venue',600,240,new Set()),false);
 assert.equal(open(day,'hyzr',600,90,new Set()),true);
});
