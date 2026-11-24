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
  'gk-v2-summary':{},'gk-v2-continue':{},'gk-v2-shorten':{},'gk-v2-terms-campaign-price':{},'gk-punch-use':{checked:false},
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

class CalendarElement {
 constructor(){this.children=[];this.dataset={};this.classList={toggle(){}};}
 append(child){this.children.push(child);}
 replaceChildren(...children){this.children=children;}
 createTHead(){return new CalendarElement();}
 createTBody(){this.body=new CalendarElement();return this.body;}
 insertRow(){const row=new CalendarElement();row.sectionRowIndex=this.children.length;this.append(row);return row;}
 insertCell(){const cell=new CalendarElement();cell.cellIndex=this.children.length;this.append(cell);return cell;}
 get rows(){return this.children;}
 get cells(){return this.children;}
 get firstElementChild(){return this.children[0];}
 querySelectorAll(){return this.children[0]?.body.rows??[];}
 querySelector(){return this.querySelectorAll()[0];}
 setAttribute(){}
 focus(){}
}

test('one click selects an hour, shortening keeps the start, and expired rows disappear',()=>{
 const script=html.slice(html.indexOf('// Compare Oslo wall-clock dates'),html.indexOf('function validateQuickbutikCartAdd('));
 for(const [resource,hourPrice,halfHourPrice] of [['hyzr',75,45],['dart_a',60,40],['dart_b',60,40]]){
  let now=Date.parse('2026-11-24T16:49:59Z');
  const nodes=new Map(),$=id=>{
   if(!nodes.has(id))nodes.set(id,new CalendarElement());
   return nodes.get(id);
  };
  const calendar=$('gk-v2-times'),field=$('gk-v2-duration'),day='2026-11-24';
  $('gk-v2-resource').value=resource;
  $('gk-v2-day').value=day;
  $('gk-v2-sets-qty').value='0';
  const openingHours={from:600,to:1320};
  const snapshot={day,bookingEnabled:true,openingHoursByResource:{hyzr:openingHours,dart_a:openingHours,dart_b:openingHours},claims:[{resource,slot_min:1170}]};
  const context={$,selected:null,snapshot,PUBLIC_PRICES:policies,CONF:{checkoutVerified:true},canUseQuickbutikCart:()=>true,
   Date:class extends Date{static now(){return now;}},location:{search:''},URLSearchParams,
   document:{createElement:()=>new CalendarElement(),getElementById:$,querySelectorAll:()=>[],addEventListener(){}}};
  runInNewContext(script+';render(snapshot)',context);
  const slot=(minutes,area=resource)=>calendar.querySelectorAll().find(row=>row.dataset.time===minutes)?.cells[area==='dart_b'?2:1].firstElementChild;
  assert.equal(field.value,'60');
  assert.equal(slot(1050),undefined);
  assert.equal(slot(1080).textContent,hourPrice+' kr');
  assert.equal(slot(1140).disabled,true);
  slot(1080).onclick();
  assert.match($('gk-v2-summary').innerHTML,new RegExp('18:00–19:00 · '+hourPrice+' kr'));
  assert.equal($('gk-v2-shorten').hidden,false);
  $('gk-v2-shorten').onclick();
  assert.match($('gk-v2-summary').innerHTML,new RegExp('18:00–18:30 · '+halfHourPrice+' kr'));
  assert.equal($('gk-v2-shorten').hidden,true);
  assert.equal(slot(1140).disabled,false);
  $('gk-v2-terms').hidden=false;
  now+=1000;
  context.refreshTimeCutoff();
  assert.equal(slot(1080),undefined);
  assert.equal($('gk-v2-terms').hidden,true);
  assert.equal($('gk-v2-continue').disabled,true);
 }
});
