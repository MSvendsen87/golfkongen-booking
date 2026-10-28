// GolfKongen Booking 2.0 — Quickbutik /aktiviteter loader.
// Can be included from the Quickbutik theme's Body End. Does nothing on other pages.
// Checkout remains independently gated by gk-booking-v2 /window + 8 release gates.
(function(){
 'use strict';
 if(location.pathname.replace(/\/$/,'')!=='/aktiviteter')return;
 if(document.getElementById('gk2-activities-loader-loaded'))return;
 const marker=document.createElement('span');
 marker.id='gk2-activities-loader-loaded';marker.hidden=true;
 document.body.appendChild(marker);
 function polishPage(){
  // Only the redundant Quickbutik page title; keep the actual SEO h1 in the page content.
  const headings=[...document.querySelectorAll('h1,h2')];
  const redundant=headings.filter(h=>h.textContent.trim()==='GolfKongen – Aktiviteter & booking');
  if(redundant.length>0){const h=redundant[0];h.style.display='none';}
  // Give the existing SEO section a quieter editorial layout instead of a competing CTA card.
  const seo=headings.find(h=>h.textContent.trim()==='Dart og discgolf-simulator i Lyngdal');
  if(seo){const panel=seo.closest('section')||seo.parentElement;if(panel){
   panel.style.maxWidth='1180px';panel.style.margin='16px auto 0';panel.style.padding='18px 22px';
   panel.style.border='1px solid rgba(140,165,145,.22)';panel.style.borderRadius='14px';
   panel.style.background='rgba(255,255,255,.025)';
   seo.style.margin='0 0 8px';seo.style.fontSize='clamp(18px,2vw,23px)';
  }}
 }
 function mount(){
  polishPage();
  let anchor=document.getElementById('gk2-booking-anchor');
  if(!anchor){
   anchor=document.createElement('div');
   anchor.id='gk2-booking-anchor';
   anchor.style.cssText='max-width:1180px;margin:12px auto;padding:0 12px;scroll-margin-top:80px;';
   const root=document.querySelector('#gk-aktiviteter')||
    document.querySelector('main article')||document.querySelector('main')||
    document.querySelector('#content')||document.body;
   root.appendChild(anchor);
  }
  if(document.querySelector('script[data-gk2-native-loader]'))return;
  const script=document.createElement('script');
  script.src='https://msvendsen87.github.io/golfkongen-booking/booking/embed.js?v=20261027-install-v2';
  script.dataset.gk2NativeLoader='1';
  script.defer=true;
  script.addEventListener('load',function(){
   var host=document.getElementById('gk2-native-booking');
   var note=document.getElementById('gk2-embed-loading');
   if(host){
    if(note)note.remove();
   }else if(note){
    note.textContent='Bookingkalenderen ble ikke montert. Oppdater siden og prøv igjen.';
   }
  });
  script.addEventListener('error',function(){
   var note=document.getElementById('gk2-embed-loading');
   if(note)note.textContent='Bookingkalenderen kunne ikke lastes. Oppdater siden og prøv igjen.';
  });
  document.body.appendChild(script);
  document.querySelectorAll('#gk-aktiviteter a[data-gk2-resource]').forEach(function(a){
   a.addEventListener('click',function(){
    var selected=a.getAttribute('data-gk2-resource');
    var input=document.getElementById('gk-v2-resource');
    if(input&&['dart_a','dart_b','hyzr','venue'].includes(selected)){
     input.value=selected;input.dispatchEvent(new Event('change',{bubbles:true}));
    }
   });
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
 else mount();
})();
