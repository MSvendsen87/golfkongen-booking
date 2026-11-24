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
 const c={availabilityRequest:0,selected:null,CONF:{apiUrl:'https://example.invalid'},$:id=>nodes[id],updateSummary(){},renderDays(){},fetch:()=>new Promise(r=>{resolver=r}),render:()=>{throw Error('stale render')},encodeURIComponent,Error};
 const source=html.slice(html.indexOf('function draw(){'),html.indexOf('function advanceFinishedDay('));
 runInNewContext(source+';draw()',c);
 nodes['gk-v2-day'].value='2026-11-03';
 resolver({ok:true,json:async()=>({ok:true,day:'2026-11-02'})});
 await new Promise(r=>setImmediate(r));
 assert.equal(nodes['gk-v2-status'].textContent,'Henter tilgjengelige tider …');
});

test('the legacy dart link opens the live dart calendar and preserves campaign attribution',()=>{
 const script=readFileSync(new URL('../docs/booking/quickbutik-redirect-v6.js',import.meta.url),'utf8');
 let redirected;
 for(const [path,activity] of [['/sider/dart-booking/','dart'],['/sider/disc-booking',null]]){
  runInNewContext(script,{URL,window:{},location:{pathname:path,search:'?utm_source=facebook',replace(url){redirected=new URL(url);}}});
  assert.equal(redirected.pathname,'/aktiviteter');
  assert.equal(redirected.hash,'#gk2-booking-anchor');
  assert.equal(redirected.searchParams.get('utm_source'),'facebook');
  assert.equal(redirected.searchParams.get('aktivitet'),activity);
 }
});

test('the Black Week total uses the duration price and keeps dart-set rental at full price',()=>{
 let now=Date.parse('2026-11-29T22:58:59Z');
 const nodes={
  'gk-v2-resource':{value:'dart_a'},'gk-v2-duration':{value:'60'},'gk-v2-sets-qty':{value:'2'},
  'gk-v2-summary':{},'gk-v2-continue':{},'gk-v2-terms-campaign-price':{},'gk-punch-use':{checked:false},
  'gk-v2-black-week':{},'gk-v2-hyzr-rate':{},'gk-v2-dart-rate':{},
 };
 const $=id=>nodes[id];
 const pricing=html.slice(html.indexOf('function priceFor('),html.indexOf('function renderDays('));
 const summary=html.slice(html.indexOf('function updateSummary('),html.indexOf('function refreshDartSets('));
 const {updateSummary,refreshBookingRates}=runInNewContext(pricing+summary+';({updateSummary,refreshBookingRates})',{
  PUBLIC_PRICES:policies,selected:1080,$,document:{getElementById:$},canUseQuickbutikCart:()=>true,
  Date:{parse:Date.parse,now:()=>now},
 });
 refreshBookingRates();
 updateSummary();
 assert.match(nodes['gk-v2-dart-rate'].innerHTML,/<strong>60 kr\/t<\/strong> <del>120 kr\/t<\/del>/);
 assert.match(nodes['gk-v2-hyzr-rate'].innerHTML,/<strong>75 kr\/t<\/strong>/);
 assert.match(nodes['gk-v2-summary'].innerHTML,/18:00–19:00 · 110 kr.*Booking 60 kr \+ 2 pilsett à 25 kr/);
 assert.equal(nodes['gk-v2-terms-campaign-price'].textContent,'Black Week · 18:00–19:00 · 110 kr inkludert pilsett');
 nodes['gk-v2-resource'].value='hyzr';
 nodes['gk-punch-use'].checked=true;
 updateSummary();
 assert.match(nodes['gk-v2-summary'].textContent,/Klippekort/);
 assert.equal(nodes['gk-v2-terms-campaign-price'].hidden,true);
 nodes['gk-v2-resource'].value='dart_a';
 now+=1000;
 refreshBookingRates();
 updateSummary();
 assert.equal(nodes['gk-v2-black-week'].hidden,true);
 assert.equal(nodes['gk-v2-terms-campaign-price'].hidden,true);
 assert.match(nodes['gk-v2-summary'].innerHTML,/18:00–19:00 · 170 kr/);
});
