import {readFileSync,writeFileSync} from 'node:fs';
const pageUrl=new URL('../../docs/booking/index.html',import.meta.url);
const prices=JSON.parse(readFileSync(new URL('../data/public-prices.json',import.meta.url),'utf8'));
let page=readFileSync(pageUrl,'utf8');
page=page.replace(/^var PUBLIC_PRICES=.*;$/m,'var PUBLIC_PRICES='+JSON.stringify(prices)+';');
writeFileSync(pageUrl,page);
const section=page.slice(page.indexOf('<section id="gk-booking-v2-livewidget"'),page.lastIndexOf('</main>'));
const script=section.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!script||!section.endsWith('</section>'))throw Error('Invalid widget source');
const markup=section.replace(/<script>[\s\S]*?<\/script>/,'');
const output=`// Generated from docs/booking/index.html. Rebuild with build-storefront-embed.mjs.
(function(){'use strict';
 if(document.getElementById('gk2-native-booking'))return;
 var host=document.createElement('div');host.id='gk2-native-booking';host.hidden=true;
 var anchor=document.getElementById('gk2-booking-anchor');
 if(!anchor)return;
 anchor.appendChild(host);host.innerHTML=${JSON.stringify(markup)};
 var init=document.createElement('script');init.textContent=${JSON.stringify(script)};host.appendChild(init);
 // Customer-facing Quickbutik page: remove internal development notes.
 if((location.pathname.endsWith('/')?location.pathname.slice(0,-1):location.pathname)==='/aktiviteter'){
   var activities=document.getElementById('gk-aktiviteter');
   var section=document.getElementById('gk2-booking-section');
   var kicker=section&&section.querySelector('.gka-booking-kicker');
   var heading=section&&section.querySelector('.gka-booking-head p');
   var clubInfo=section&&section.querySelector('.gka-booking-info');
   var footer=activities&&activities.querySelector('.gka-footnote');
   if(kicker)kicker.textContent='BESTILL AKTIVITET';
   if(heading)heading.textContent='Velg aktivitet, dato og varighet. Se ledige tider, godta vilkårene og fullfør bestillingen i GolfKongens kasse. Tilgangskoden sendes på e-post etter bekreftet booking.';
   if(clubInfo)clubInfo.textContent='Klubbkveld for Lyngdal Dartklubb: torsdag kl. 19–22, inntil 10 plasser, 50 kr per person. Påmelding åpner snart.';
   if(footer)footer.textContent='Alle bookinger følger GolfKongens vilkår. Adgangskoden kan brukes fra 10 minutter før bookingstart.';
   var osloToday=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   activities&&activities.querySelectorAll('.gka-card.disc .gka-media-badge,.gka-card.disc .gka-tag').forEach(function(badge){
     if(osloToday>='2026-11-01')badge.remove();
     else badge.textContent='Fra 1. november';
   });
   var loading=document.getElementById('gk2-embed-loading');
   if(loading)loading.remove();
 }
 var preview=new URLSearchParams(location.search).get('booking2')==='preview';
 var publicActivities=(location.pathname.endsWith('/')?location.pathname.slice(0,-1):location.pathname)==='/aktiviteter';
 if(preview||publicActivities){host.hidden=false;}
 fetch('https://eadgdcimcmfyuicizboo.supabase.co/functions/v1/gk-booking-v2/window',{cache:'no-store'})
 .then(function(r){if(!r.ok)throw Error('window unavailable');return r.json()})
 .then(function(w){
  var live=w.ok===true&&w.bookingEnabled===true&&w.checkoutEnabled===true;
  if(!live&&!preview&&!publicActivities)return;host.hidden=false;
  if(live&&document.getElementById('gk2-checkout-locked-note'))document.getElementById('gk2-checkout-locked-note').remove();
  var mapping={'/sider/disc-booking':'hyzr','/sider/dart-booking':'dart_a','/sider/leie-hele-lokalet':'venue'};
  document.querySelectorAll('#gk-aktiviteter a[href]').forEach(function(a){
   var path=new URL(a.href,location.href).pathname,resource=mapping[path];if(!resource)return;
   a.href='#gk2-booking-anchor';a.addEventListener('click',function(){
    var select=document.getElementById('gk-v2-resource');select.value=resource;select.dispatchEvent(new Event('change',{bubbles:true}));
   });
  });
 }).catch(function(){/* Keep existing booking links when readiness cannot be proven. */});
})();
`;
writeFileSync(new URL('../../docs/booking/embed.js',import.meta.url),output);
console.log('Generated native storefront embed; checkout remains server gated.');
