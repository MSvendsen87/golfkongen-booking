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
 var preview=new URLSearchParams(location.search).get('booking2')==='preview';
 var publicActivities=location.pathname.replace(/\\/$/,'')==='/aktiviteter';
 if(preview||publicActivities){host.hidden=false;var note=document.createElement('p');note.textContent='Booking 2.0 vises nå på aktivitetssiden. Betaling åpner når de siste kontrollene er godkjent.';note.style.cssText='padding:12px;background:#3b3020;color:#ffebaa;border-radius:10px';note.id='gk2-checkout-locked-note';host.prepend(note);}
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
